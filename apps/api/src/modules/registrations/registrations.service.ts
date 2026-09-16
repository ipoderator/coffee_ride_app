import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  organizerProfiles,
  registrations,
  rides,
  users,
  waitlistEntries,
} from 'db/schema';
import type { DbClient } from 'db';
import type {
  ListMyRegistrationsResponse,
  ListRideParticipantsResponse,
  ListRideWaitlistResponse,
  ListRidesQuery,
  MyRegistrationsQuery,
  Registration,
  RideParticipantSummary,
  WaitlistEntry,
} from 'types';
import {
  CursorError,
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '../../lib/cursor.js';
import { toPublicRide } from '../rides/rides.service.js';
import {
  createRegistrationConfirmedNotification,
  type NotificationLogger,
} from '../notifications/notifications.service.js';
import { getOrganizerRatingSummaries } from '../reviews/reviews.service.js';

// Domain error the route layer maps to RFC 9457 — same pattern as
// `RideServiceError`/`OrganizerServiceError`/`AuthServiceError`
// (`.claude/rules/backend.md`: route -> validation -> service -> repository). A
// distinct class rather than reusing `RideServiceError`: `registrations` is its own
// capability module (`.claude/rules/architecture.md`'s Feature boundaries list;
// `.claude/context/current-task.md`'s scope decision), even though its endpoints are
// nested under `/v1/rides/:id/...`.
export class RegistrationServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'RegistrationServiceError';
  }
}

// Same resource-enumeration-safe shape as `rides.service.ts`'s own `RIDE_NOT_FOUND` —
// covers both "no such ride" and "exists but is someone else's still-`draft` ride".
// Not imported from `rides.service.ts`: each module owns its own domain-error
// factories (that file's own comment on `EMAIL_VERIFICATION_REQUIRED` explains why).
const RIDE_NOT_FOUND = () =>
  new RegistrationServiceError(
    'ride_not_found',
    404,
    'Ride not found',
    'No ride with that id exists.',
  );

const RIDE_REGISTRATION_NOT_OPEN = () =>
  new RegistrationServiceError(
    'ride_registration_not_open',
    409,
    'Ride registration is not open',
    'This ride is not currently open for registration.',
  );

const REGISTRATION_ALREADY_EXISTS = () =>
  new RegistrationServiceError(
    'registration_already_exists',
    409,
    'Registration already exists',
    'You already have an active registration for this ride.',
  );

const RIDE_FULL = () =>
  new RegistrationServiceError(
    'ride_full',
    409,
    'Ride is full',
    'This ride has reached its participant limit.',
  );

const REGISTRATION_NOT_FOUND = () =>
  new RegistrationServiceError(
    'registration_not_found',
    404,
    'Registration not found',
    'You do not have an active registration for this ride.',
  );

// CR-036 ("Waitlist"): joining the queue only makes sense once there is no open spot
// — a ride with an unlimited (`null`) `participantLimit`, or one that still has room,
// should be registered for directly instead.
const RIDE_NOT_FULL = () =>
  new RegistrationServiceError(
    'ride_not_full',
    409,
    'Ride is not full',
    'This ride still has open spots — register instead of joining the waitlist.',
  );

const WAITLIST_ENTRY_ALREADY_EXISTS = () =>
  new RegistrationServiceError(
    'waitlist_entry_already_exists',
    409,
    'Waitlist entry already exists',
    'You are already on the waitlist for this ride.',
  );

const WAITLIST_ENTRY_NOT_FOUND = () =>
  new RegistrationServiceError(
    'waitlist_entry_not_found',
    404,
    'Waitlist entry not found',
    'You are not on the waitlist for this ride.',
  );

// CR-037 ("Organizer participant list"). Same code/shape as `rides.service.ts`'s own
// `INVALID_CURSOR` (not imported — each module owns its own domain-error factories,
// same reasoning as `RIDE_NOT_FOUND` above).
const INVALID_CURSOR = () =>
  new RegistrationServiceError(
    'invalid_cursor',
    400,
    'Invalid cursor',
    'The cursor parameter is not a valid pagination cursor.',
  );

export function toRegistration(
  row: typeof registrations.$inferSelect,
): Registration {
  return {
    id: row.id,
    rideId: row.rideId,
    userId: row.userId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
  };
}

export function toWaitlistEntry(
  row: typeof waitlistEntries.$inferSelect,
): WaitlistEntry {
  return {
    id: row.id,
    rideId: row.rideId,
    userId: row.userId,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    promotedAt: row.promotedAt ? row.promotedAt.toISOString() : null,
  };
}

/**
 * Same viewer-visibility rule as `rides.service.ts`'s `getRideForViewer`: the ride's
 * own organizer sees it at any status, anyone else gets `404 ride_not_found` for a
 * non-existent ride *or* someone else's still-`draft` one — never distinguished. Not
 * a lock — just resolves which 404/409 applies before {@link createRegistration}
 * opens its own locked transaction.
 */
async function resolveVisibleRideStatus(
  db: DbClient,
  userId: string,
  rideId: string,
) {
  const [row] = await db
    .select({
      status: rides.status,
      organizerUserId: organizerProfiles.userId,
    })
    .from(rides)
    .innerJoin(organizerProfiles, eq(rides.organizerId, organizerProfiles.id))
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!row) {
    throw RIDE_NOT_FOUND();
  }
  const isOwner = row.organizerUserId === userId;
  if (!isOwner && row.status === 'draft') {
    throw RIDE_NOT_FOUND();
  }
  return row.status;
}

/**
 * CR-037 ("Organizer participant list"): unlike {@link resolveVisibleRideStatus}
 * (any viewer, once the ride has left `draft`), the participant/waitlist lists are
 * organizer-only at any ride status — the ride's own organizer must be the caller.
 * Same resource-enumeration-safe `404 ride_not_found` either way (no such ride, or
 * someone else's), same pattern `rides.service.ts`'s `publishRide` etc. use for
 * every other organizer-only action.
 */
async function assertOwnRide(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: rides.id })
    .from(rides)
    .innerJoin(organizerProfiles, eq(rides.organizerId, organizerProfiles.id))
    .where(and(eq(rides.id, rideId), eq(organizerProfiles.userId, userId)))
    .limit(1);
  if (!row) {
    throw RIDE_NOT_FOUND();
  }
}

function toRideParticipantSummary(row: {
  id: string;
  userId: string;
  displayName: string | null;
  createdAt: Date;
}): RideParticipantSummary {
  return {
    id: row.id,
    userId: row.userId,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * CR-037. Active registrations only, ordered `createdAt asc` (registration order —
 * oldest first; deliberately not `/mine`'s `createdAt desc`, a different list's own
 * precedent). Cursor pagination per ADR-011, same `apps/api/src/lib/cursor.ts`
 * helper every other collection endpoint uses; ascending order means the cursor
 * condition is `>` the last row seen, not `<` (`/mine`'s descending `<`).
 */
export async function listParticipants(
  db: DbClient,
  userId: string,
  rideId: string,
  query: ListRidesQuery,
): Promise<ListRideParticipantsResponse> {
  await assertOwnRide(db, userId, rideId);

  const limit = clampLimit(query.limit);
  const conditions = [
    eq(registrations.rideId, rideId),
    eq(registrations.status, 'active'),
  ];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    // `date_trunc('milliseconds', ...)` on the column side, not just the bind
    // parameter: `cursorKey.sortValue` came from a JS `Date`'s `toISOString()`
    // (millisecond precision), but Postgres stores `timestamptz` at microsecond
    // precision — without truncating the column too, the row that produced the
    // cursor always satisfies its own `>` comparison (its stored value is always
    // >= the millisecond-truncated one), so ascending pagination would never
    // advance past page one. `/mine`'s descending `<` cursor (`rides.service.ts`)
    // doesn't need this: the same truncation makes a row's own comparison `<` come
    // out false for itself, not true. Discovered live while building this ticket.
    conditions.push(
      sql`(date_trunc('milliseconds', ${registrations.createdAt}), ${registrations.id}) > (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      id: registrations.id,
      userId: registrations.userId,
      displayName: users.displayName,
      createdAt: registrations.createdAt,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .where(and(...conditions))
    .orderBy(asc(registrations.createdAt), asc(registrations.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
      : null;

  return { items: page.map(toRideParticipantSummary), nextCursor };
}

/**
 * CR-037. `status: 'waiting'` entries only, ordered `createdAt asc` — exact FIFO
 * order, the same one {@link cancelRegistration}'s promotion query already uses.
 * Same organizer-only ownership gate and cursor mechanics as
 * {@link listParticipants}.
 */
export async function listWaitlist(
  db: DbClient,
  userId: string,
  rideId: string,
  query: ListRidesQuery,
): Promise<ListRideWaitlistResponse> {
  await assertOwnRide(db, userId, rideId);

  const limit = clampLimit(query.limit);
  const conditions = [
    eq(waitlistEntries.rideId, rideId),
    eq(waitlistEntries.status, 'waiting'),
  ];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    // Same `date_trunc` fix as {@link listParticipants} — see its comment.
    conditions.push(
      sql`(date_trunc('milliseconds', ${waitlistEntries.createdAt}), ${waitlistEntries.id}) > (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      id: waitlistEntries.id,
      userId: waitlistEntries.userId,
      displayName: users.displayName,
      createdAt: waitlistEntries.createdAt,
    })
    .from(waitlistEntries)
    .innerJoin(users, eq(waitlistEntries.userId, users.id))
    .where(and(...conditions))
    .orderBy(asc(waitlistEntries.createdAt), asc(waitlistEntries.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
      : null;

  return { items: page.map(toRideParticipantSummary), nextCursor };
}

/**
 * CR-091 ("My registrations", `.claude/context/current-task.md`). The caller's own
 * active registrations, each joined with its ride's public+organizer summary
 * (`toPublicRide`, reused from `rides.service.ts` rather than re-deriving the same
 * 20-field mapping). Active only (`status: 'active'`) — a cancelled registration
 * isn't "a ride you're registered for" any more, same filter
 * {@link listParticipants}/{@link listWaitlist} already use.
 *
 * Two independent, server-filtered pages rather than one fetched page split
 * client-side: `when: 'upcoming'` is `ride.startsAt >= now()`, ordered `startsAt asc`
 * (soonest first, same convention CR-025/KI-029 set for discovery); `when: 'past'` is
 * `ride.startsAt < now()`, ordered `startsAt desc` (most recent past first). No
 * `date_trunc('milliseconds', ...)` cursor fix (KI-039) needed — `ride.startsAt` is
 * organizer-entered, not a `now()`-derived microsecond-precision value.
 */
export async function listMyRegistrations(
  db: DbClient,
  userId: string,
  query: MyRegistrationsQuery,
): Promise<ListMyRegistrationsResponse> {
  const limit = clampLimit(query.limit);
  // Passed as the ISO string it already is, not a raw `Date` — same reasoning
  // `rides.service.ts`'s `listOwnRides` documents for its own cursor comparison: the
  // `postgres` driver only auto-serializes parameters bound through Drizzle's typed
  // column helpers, not a raw JS `Date` interpolated into a hand-written `sql`
  // template (throws `ERR_INVALID_ARG_TYPE`).
  const nowIso = new Date().toISOString();
  const isUpcoming = query.when === 'upcoming';

  const conditions = [
    eq(registrations.userId, userId),
    eq(registrations.status, 'active'),
    isUpcoming
      ? sql`${rides.startsAt} >= ${nowIso}::timestamptz`
      : sql`${rides.startsAt} < ${nowIso}::timestamptz`,
  ];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    conditions.push(
      isUpcoming
        ? sql`(${rides.startsAt}, ${registrations.id}) > (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`
        : sql`(${rides.startsAt}, ${registrations.id}) < (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      registration: registrations,
      ride: rides,
      organizerId: organizerProfiles.id,
      organizerName: organizerProfiles.name,
    })
    .from(registrations)
    .innerJoin(rides, eq(registrations.rideId, rides.id))
    .innerJoin(organizerProfiles, eq(rides.organizerId, organizerProfiles.id))
    .where(and(...conditions))
    .orderBy(
      isUpcoming ? asc(rides.startsAt) : desc(rides.startsAt),
      isUpcoming ? asc(registrations.id) : desc(registrations.id),
    )
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          sortValue: last.ride.startsAt.toISOString(),
          id: last.registration.id,
        })
      : null;

  // CR-043 ("Organizer rating summary"): same batched-not-N+1 precedent
  // `rides.service.ts`'s `listPublicRides` already uses.
  const ratingByOrganizerId = await getOrganizerRatingSummaries(
    db,
    page.map((row) => row.organizerId),
  );

  return {
    items: page.map((row) => {
      const summary = ratingByOrganizerId.get(row.organizerId) ?? {
        rating: null,
        reviewCount: 0,
      };
      return {
        registration: toRegistration(row.registration),
        ride: {
          ...toPublicRide(row.ride),
          organizer: {
            id: row.organizerId,
            name: row.organizerName,
            rating: summary.rating,
            reviewCount: summary.reviewCount,
          },
        },
      };
    }),
    nextCursor,
  };
}

/**
 * CR-032 ("Register"), bundled with CR-034 ("Capacity enforcement") and CR-035
 * ("Duplicate protection") — `.claude/CLAUDE.md`/`.claude/rules/database.md` require
 * registration to atomically protect availability, capacity, and duplicates from the
 * start, not as later tickets (`.claude/context/current-task.md`).
 *
 * One `SELECT ... FOR UPDATE` on the `rides` row (not a join) serializes every
 * concurrent registration attempt for the *same* ride — the second request waits for
 * the first to commit, then sees its committed state. That single lock is what makes
 * the duplicate check, the capacity check, and double-submit protection all
 * race-free at once; the DB-level partial unique index
 * (`registrations_ride_id_user_id_active_unique`) is the invariant backstop per
 * `.claude/rules/database.md`, not a path this code needs to catch a constraint
 * violation for.
 *
 * CR-038 ("Registration confirmation", `.claude/context/current-task.md`): once
 * the transaction above has committed, creates a `registration_confirmed`
 * notification for the new registrant — never inside the transaction itself
 * (`.claude/rules/resilience.md`: a non-critical side effect must never be able to
 * fail or roll back the critical action). A notification failure is logged and
 * swallowed by {@link createRegistrationConfirmedNotification} itself; this
 * function's own return value is unaffected either way.
 */
export async function createRegistration(
  db: DbClient,
  logger: NotificationLogger,
  userId: string,
  rideId: string,
): Promise<Registration> {
  // Resolves 404 vs. a later 409 correctly (visibility) before the lock.
  await resolveVisibleRideStatus(db, userId, rideId);

  const inserted = await db.transaction(async (tx) => {
    const [rideRow] = await tx
      .select({
        status: rides.status,
        participantLimit: rides.participantLimit,
      })
      .from(rides)
      .where(eq(rides.id, rideId))
      .for('update')
      .limit(1);
    // Re-checked inside the lock: guards the harmless race where the organizer
    // closes registration between the visibility check above and this lock.
    if (!rideRow || rideRow.status !== 'registration_open') {
      throw RIDE_REGISTRATION_NOT_OPEN();
    }

    const [existingActive] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.userId, userId),
          eq(registrations.status, 'active'),
        ),
      )
      .limit(1);
    if (existingActive) {
      throw REGISTRATION_ALREADY_EXISTS();
    }

    if (rideRow.participantLimit !== null) {
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(registrations)
        .where(
          and(
            eq(registrations.rideId, rideId),
            eq(registrations.status, 'active'),
          ),
        );
      if ((countRow?.count ?? 0) >= rideRow.participantLimit) {
        throw RIDE_FULL();
      }
    }

    const [row] = await tx
      .insert(registrations)
      .values({ rideId, userId, status: 'active' })
      .returning();
    if (!row) {
      throw new Error('Registration insert returned no row.');
    }
    return row;
  });

  await createRegistrationConfirmedNotification(db, logger, userId, rideId);

  return toRegistration(inserted);
}

/**
 * CR-033 ("Cancel registration"). No status gate beyond "an active registration
 * exists" — nothing in `docs/product.md`/`docs/database.md` restricts cancellation to
 * a particular ride status (`.claude/context/current-task.md`'s scope decision).
 *
 * CR-036 ("Waitlist") extends this with auto-promotion: cancelling frees exactly one
 * spot, so — inside the same transaction, under the same `rides` row lock
 * {@link createRegistration}/{@link joinWaitlist} use — the oldest `waiting` entry (if
 * any) for this ride is promoted into a brand-new active `Registration`. This is what
 * makes "waitlist consistency" atomic with the cancellation that caused it
 * (`.claude/rules/database.md`/`.claude/rules/resilience.md`), not a separate step
 * that could observe a stale state.
 *
 * CR-038 ("Registration confirmation"): a waitlist promotion is "you are now
 * registered" too, so it fires the same `registration_confirmed` notification —
 * after the transaction commits, same reasoning as {@link createRegistration}'s
 * own doc comment.
 */
export async function cancelRegistration(
  db: DbClient,
  logger: NotificationLogger,
  userId: string,
  rideId: string,
): Promise<void> {
  const promotedUserId = await db.transaction(async (tx) => {
    // Locks the same row `createRegistration`/`joinWaitlist` lock, so a concurrent
    // join/register for this ride can't race with the promotion below.
    await tx
      .select({ id: rides.id })
      .from(rides)
      .where(eq(rides.id, rideId))
      .for('update')
      .limit(1);

    const [existing] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.userId, userId),
          eq(registrations.status, 'active'),
        ),
      )
      .limit(1);
    if (!existing) {
      throw REGISTRATION_NOT_FOUND();
    }

    await tx
      .update(registrations)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, existing.id));

    const [oldestWaiting] = await tx
      .select({ id: waitlistEntries.id, userId: waitlistEntries.userId })
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.rideId, rideId),
          eq(waitlistEntries.status, 'waiting'),
        ),
      )
      .orderBy(asc(waitlistEntries.createdAt))
      .limit(1);
    if (oldestWaiting) {
      await tx
        .update(waitlistEntries)
        .set({
          status: 'promoted',
          promotedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(waitlistEntries.id, oldestWaiting.id));
      await tx.insert(registrations).values({
        rideId,
        userId: oldestWaiting.userId,
        status: 'active',
      });
    }
    return oldestWaiting?.userId ?? null;
  });

  if (promotedUserId) {
    await createRegistrationConfirmedNotification(
      db,
      logger,
      promotedUserId,
      rideId,
    );
  }
}

/**
 * CR-036 ("Waitlist"). Joining only makes sense once the ride is genuinely full — the
 * same `SELECT ... FOR UPDATE` lock {@link createRegistration} uses re-checks
 * `registration_open`, then re-derives capacity itself rather than trusting a stale
 * `409 ride_full` the caller might be reacting to (`.claude/context/current-task.md`).
 */
export async function joinWaitlist(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<WaitlistEntry> {
  await resolveVisibleRideStatus(db, userId, rideId);

  const inserted = await db.transaction(async (tx) => {
    const [rideRow] = await tx
      .select({
        status: rides.status,
        participantLimit: rides.participantLimit,
      })
      .from(rides)
      .where(eq(rides.id, rideId))
      .for('update')
      .limit(1);
    if (!rideRow || rideRow.status !== 'registration_open') {
      throw RIDE_REGISTRATION_NOT_OPEN();
    }

    const [existingActive] = await tx
      .select({ id: registrations.id })
      .from(registrations)
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.userId, userId),
          eq(registrations.status, 'active'),
        ),
      )
      .limit(1);
    if (existingActive) {
      throw REGISTRATION_ALREADY_EXISTS();
    }

    const [existingWaiting] = await tx
      .select({ id: waitlistEntries.id })
      .from(waitlistEntries)
      .where(
        and(
          eq(waitlistEntries.rideId, rideId),
          eq(waitlistEntries.userId, userId),
          eq(waitlistEntries.status, 'waiting'),
        ),
      )
      .limit(1);
    if (existingWaiting) {
      throw WAITLIST_ENTRY_ALREADY_EXISTS();
    }

    if (rideRow.participantLimit !== null) {
      const [countRow] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(registrations)
        .where(
          and(
            eq(registrations.rideId, rideId),
            eq(registrations.status, 'active'),
          ),
        );
      if ((countRow?.count ?? 0) < rideRow.participantLimit) {
        throw RIDE_NOT_FULL();
      }
    } else {
      // Unlimited capacity: never actually "full", so a waitlist can never apply.
      throw RIDE_NOT_FULL();
    }

    const [row] = await tx
      .insert(waitlistEntries)
      .values({ rideId, userId, status: 'waiting' })
      .returning();
    if (!row) {
      throw new Error('Waitlist entry insert returned no row.');
    }
    return row;
  });

  return toWaitlistEntry(inserted);
}

/**
 * CR-036 ("Waitlist"). No status gate beyond "a waiting entry exists" — same
 * "cancellation stays available" discipline `cancelRegistration` already uses.
 */
export async function leaveWaitlist(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: waitlistEntries.id })
    .from(waitlistEntries)
    .where(
      and(
        eq(waitlistEntries.rideId, rideId),
        eq(waitlistEntries.userId, userId),
        eq(waitlistEntries.status, 'waiting'),
      ),
    )
    .limit(1);
  if (!existing) {
    throw WAITLIST_ENTRY_NOT_FOUND();
  }

  await db
    .update(waitlistEntries)
    .set({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(waitlistEntries.id, existing.id));
}
