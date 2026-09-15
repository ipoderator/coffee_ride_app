import { and, asc, eq, sql } from 'drizzle-orm';
import {
  organizerProfiles,
  registrations,
  rides,
  waitlistEntries,
} from 'db/schema';
import type { DbClient } from 'db';
import type { Registration, WaitlistEntry } from 'types';

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
 */
export async function createRegistration(
  db: DbClient,
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
 */
export async function cancelRegistration(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
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
  });
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
