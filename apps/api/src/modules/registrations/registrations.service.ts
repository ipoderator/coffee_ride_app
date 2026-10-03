import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import {
  organizerProfiles,
  registrations,
  rideGroups,
  rides,
  userBikes,
  users,
  waitlistEntries,
} from 'db/schema';
import type { DbClient } from 'db';
import type {
  ListMyRegistrationsResponse,
  ListRideParticipantsResponse,
  ListRideRidersResponse,
  ListRideWaitlistResponse,
  ListRidesQuery,
  MyRegistrationsQuery,
  OrganizerActivityQuery,
  OrganizerRegistrationActivity,
  Registration,
  RegistrationAttendance,
  RideGroupRef,
  RideParticipantSummary,
  RiderProfile,
  WaitlistEntry,
} from 'types';
import {
  ARCHIVED_RIDE_STATUSES,
  ORGANIZER_ACTIVITY_DAYS,
  ORGANIZER_ACTIVITY_RECENT_LIMIT,
} from 'types';
import {
  CursorError,
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '../../lib/cursor.js';
import {
  resolveOwnOrganizerProfileId,
  toPublicRide,
} from '../rides/rides.service.js';
import {
  createRegistrationConfirmedNotification,
  type NotificationLogger,
  type NotificationQueue,
} from '../notifications/notifications.service.js';
import { getOrganizerRatingSummaries } from '../reviews/reviews.service.js';
import { organizerAvatarUrlPath } from '../organizers/organizers.service.js';
import { toBike } from '../users/users.service.js';
import {
  ImageStorageError,
  downloadImageObject,
} from '../../lib/image-storage.js';
import type { S3Handle } from '../../plugins/s3.js';

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

// CR-181 ("Finish self-check-in"): a finish can only be claimed/decided while the
// ride is under way or already over — before the start there is nothing to finish.
const RIDE_NOT_IN_PROGRESS = () =>
  new RegistrationServiceError(
    'ride_not_in_progress',
    409,
    'Ride has not started',
    'Finishing can only be reported or confirmed once the ride has started.',
  );

const ATTENDANCE_ALREADY_DECIDED = () =>
  new RegistrationServiceError(
    'attendance_already_decided',
    409,
    'Already decided',
    'The organizer has already recorded the outcome for this registration.',
  );

// Not `registration_not_found`: that one's wording is the participant's own ("you do
// not have...") and this is a list of someone else's ids.
const PARTICIPANT_NOT_FOUND = () =>
  new RegistrationServiceError(
    'participant_not_found',
    404,
    'Participant not found',
    'Some of the selected participants are not active registrations of this ride.',
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

const WAITLIST_ENTRY_NOT_FOUND = () =>
  new RegistrationServiceError(
    'waitlist_entry_not_found',
    404,
    'Waitlist entry not found',
    'You are not on the waitlist for this ride.',
  );

// CR-125: the organizer turned off `Ride.participantsVisible` — applies to every
// caller, including the ride's own organizer (they have `listParticipants` for
// management). `403`, not `404`: the ride itself is visible, only its rider list
// is hidden — a distinct, machine-readable code so the client can show "the
// organizer hid this" instead of a generic error (`.claude/rules/backend.md`).
const RIDERS_HIDDEN = () =>
  new RegistrationServiceError(
    'riders_hidden',
    403,
    'Rider list hidden',
    'The organizer has turned off the participant list for this ride.',
  );

// CR-126: no active registration with that id on this ride — distinct from
// `REGISTRATION_NOT_FOUND` below, whose message ("you do not have an active
// registration") is written for the caller's *own* registration, not a lookup by
// another rider's registration id.
const RIDER_NOT_FOUND = () =>
  new RegistrationServiceError(
    'rider_not_found',
    404,
    'Rider not found',
    'No active rider with that registration id exists for this ride.',
  );

// CR-126: the rider's `profileVisibility` doesn't grant this viewer access —
// `resolveRiderAccess`'s single gate, backing both the profile and avatar routes.
// `403`, not `404`: the rider is a real, visible entry in the riders list (unlike
// `RIDER_NOT_FOUND`), just not one whose card this viewer may open.
const PROFILE_PRIVATE = () =>
  new RegistrationServiceError(
    'profile_private',
    403,
    'Profile private',
    'This participant has not made their profile visible to you.',
  );

const RIDER_AVATAR_NOT_FOUND = () =>
  new RegistrationServiceError(
    'avatar_not_found',
    404,
    'Avatar not found',
    'No avatar exists for this rider.',
  );

const RIDER_AVATAR_STORAGE_UNAVAILABLE = () =>
  new RegistrationServiceError(
    'avatar_storage_unavailable',
    503,
    'Avatar storage unavailable',
    'File storage is temporarily unavailable. Try again later.',
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

// CR-117 ("Pace groups"). Input errors about the chosen group, not conflicts with the
// ride's state — hence `422`, not `409`. `group_not_found` covers "no such group",
// "a group of a different ride", and "this ride has no groups at all" alike.
const GROUP_REQUIRED = () =>
  new RegistrationServiceError(
    'group_required',
    422,
    'Group required',
    'This ride has pace groups — choose one (groupId).',
  );

const GROUP_NOT_FOUND = () =>
  new RegistrationServiceError(
    'group_not_found',
    422,
    'Group not found',
    'No group with that id exists for this ride.',
  );

// Same frozen set as `ride-groups.service.ts`'s organizer-side rule: once a ride is
// finished or cancelled, nobody's group changes any more.
const GROUP_CHANGE_NOT_ALLOWED = () =>
  new RegistrationServiceError(
    'group_change_not_allowed',
    409,
    'Group change not allowed',
    'Groups cannot be changed once a ride is finished or cancelled.',
  );

type DbTransaction = Parameters<Parameters<DbClient['transaction']>[0]>[0];

/**
 * CR-117: resolves the group a register/waitlist call asked for, inside the caller's
 * locked transaction (the `rides` row lock also serializes group deletes —
 * `ride-groups.service.ts`'s `deleteRideGroup` takes the same lock). Returns the
 * group id to store, or `null` for a ride without groups. The composite FK
 * `registrations_group_ride_fk` is the DB-level backstop for "same ride".
 */
async function resolveGroupChoice(
  tx: DbTransaction,
  rideId: string,
  groupId: string | undefined,
): Promise<string | null> {
  const groups = await tx
    .select({ id: rideGroups.id })
    .from(rideGroups)
    .where(eq(rideGroups.rideId, rideId));
  if (groupId === undefined) {
    if (groups.length > 0) throw GROUP_REQUIRED();
    return null;
  }
  if (!groups.some((group) => group.id === groupId)) {
    throw GROUP_NOT_FOUND();
  }
  return groupId;
}

function toGroupRef(row: {
  groupId: string | null;
  groupName: string | null;
  groupPaceKmh: number | null;
}): RideGroupRef | null {
  if (
    row.groupId === null ||
    row.groupName === null ||
    row.groupPaceKmh === null
  ) {
    return null;
  }
  return { id: row.groupId, name: row.groupName, paceKmh: row.groupPaceKmh };
}

export function toRegistration(
  row: typeof registrations.$inferSelect,
): Registration {
  return {
    id: row.id,
    rideId: row.rideId,
    userId: row.userId,
    status: row.status,
    groupId: row.groupId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    finishClaimedAt: row.finishClaimedAt
      ? row.finishClaimedAt.toISOString()
      : null,
    attendance: row.attendance,
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
    groupId: row.groupId,
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
      participantsVisible: rides.participantsVisible,
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
  return row;
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

// CR-125: the name shown for a rider/participant/waitlist entry. `firstName`/
// `lastName` (a real name) take priority over `displayName` (a free-text
// nickname, CR-013's original field) when either is set; `displayName` alone
// stays the fallback for a user who hasn't filled in the new fields yet.
function resolveParticipantName(row: {
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
}): string | null {
  const fullName = [row.firstName, row.lastName].filter(Boolean).join(' ');
  return fullName || row.displayName;
}

function toRideParticipantSummary(row: {
  id: string;
  userId: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
  groupId: string | null;
  groupName: string | null;
  groupPaceKmh: number | null;
  // CR-181: absent for a waitlist entry, which has neither.
  finishClaimedAt?: Date | null;
  attendance?: RegistrationAttendance | null;
}): RideParticipantSummary {
  return {
    id: row.id,
    userId: row.userId,
    displayName: resolveParticipantName(row),
    createdAt: row.createdAt.toISOString(),
    group: toGroupRef(row),
    finishClaimedAt: row.finishClaimedAt
      ? row.finishClaimedAt.toISOString()
      : null,
    attendance: row.attendance ?? null,
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

  // CR-117: `leftJoin` on the group — a registration without one still lists.
  const rows = await db
    .select({
      id: registrations.id,
      userId: registrations.userId,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: registrations.createdAt,
      groupId: registrations.groupId,
      groupName: rideGroups.name,
      groupPaceKmh: rideGroups.paceKmh,
      finishClaimedAt: registrations.finishClaimedAt,
      attendance: registrations.attendance,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .leftJoin(rideGroups, eq(registrations.groupId, rideGroups.id))
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
 * KI-066: the `/organizer` dashboard's registration feed and per-day chart as
 * one aggregate over every ride the caller organizes. Active registrations on
 * rides that aren't drafts or cancelled. `recent` keeps the widget's earlier
 * scope — rides starting no earlier than a week ago — so a long-finished
 * ride's sign-ups don't read as "new". Days are bucketed in Postgres in the
 * viewer's `timeZone`, so a registration at 23:30 local lands on its own day.
 */
export async function getOwnRegistrationActivity(
  db: DbClient,
  userId: string,
  query: OrganizerActivityQuery,
): Promise<OrganizerRegistrationActivity> {
  const dates = activityDates(query.from);
  const organizerProfileId = await resolveOwnOrganizerProfileId(db, userId);
  if (!organizerProfileId) {
    return { recent: [], days: dates.map((date) => ({ date, count: 0 })) };
  }

  const ownCountedRegistrations = and(
    eq(rides.organizerId, organizerProfileId),
    sql`${rides.status} not in ('draft', 'cancelled')`,
    eq(registrations.status, 'active'),
  );
  const localDay = sql<string>`to_char(${registrations.createdAt} at time zone ${query.timeZone}, 'YYYY-MM-DD')`;

  const [recentRows, dayRows] = await Promise.all([
    db
      .select({
        id: registrations.id,
        rideId: registrations.rideId,
        rideTitle: rides.title,
        displayName: users.displayName,
        firstName: users.firstName,
        lastName: users.lastName,
        createdAt: registrations.createdAt,
        groupId: registrations.groupId,
        groupName: rideGroups.name,
        groupPaceKmh: rideGroups.paceKmh,
      })
      .from(registrations)
      .innerJoin(rides, eq(registrations.rideId, rides.id))
      .innerJoin(users, eq(registrations.userId, users.id))
      .leftJoin(rideGroups, eq(registrations.groupId, rideGroups.id))
      .where(
        and(
          ownCountedRegistrations,
          sql`${rides.startsAt} >= now() - interval '7 days'`,
        ),
      )
      .orderBy(desc(registrations.createdAt), desc(registrations.id))
      .limit(ORGANIZER_ACTIVITY_RECENT_LIMIT),
    db
      .select({ date: localDay, count: sql<number>`count(*)::int` })
      .from(registrations)
      .innerJoin(rides, eq(registrations.rideId, rides.id))
      .where(
        and(
          ownCountedRegistrations,
          sql`${registrations.createdAt} >= (${query.from}::date)::timestamp at time zone ${query.timeZone}`,
          sql`${registrations.createdAt} < (${query.from}::date + ${ORGANIZER_ACTIVITY_DAYS}::int)::timestamp at time zone ${query.timeZone}`,
        ),
      )
      // By position: the time zone is a bind parameter, so the same expression
      // repeated in GROUP BY would be a different parameter to Postgres.
      .groupBy(sql`1`),
  ]);

  const counts = new Map(dayRows.map((row) => [row.date, row.count]));
  return {
    recent: recentRows.map((row) => ({
      id: row.id,
      rideId: row.rideId,
      rideTitle: row.rideTitle,
      displayName: resolveParticipantName(row),
      group: toGroupRef(row),
      createdAt: row.createdAt.toISOString(),
    })),
    days: dates.map((date) => ({ date, count: counts.get(date) ?? 0 })),
  };
}

/** `ORGANIZER_ACTIVITY_DAYS` consecutive calendar dates starting at `from`. */
function activityDates(from: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: ORGANIZER_ACTIVITY_DAYS }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10),
  );
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
      firstName: users.firstName,
      lastName: users.lastName,
      createdAt: waitlistEntries.createdAt,
      groupId: waitlistEntries.groupId,
      groupName: rideGroups.name,
      groupPaceKmh: rideGroups.paceKmh,
    })
    .from(waitlistEntries)
    .innerJoin(users, eq(waitlistEntries.userId, users.id))
    .leftJoin(rideGroups, eq(waitlistEntries.groupId, rideGroups.id))
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
 * CR-117: `GET /v1/rides/:id/riders` — who is riding, for any *signed-in* viewer
 * (the route requires a session; anonymous visitors only see
 * `GetRideResponse.registrationsCount`). Same visibility as `GET /v1/rides/:id`:
 * `404 ride_not_found` for a non-existent ride or someone else's `draft`.
 * CR-125: `403 riders_hidden` when the organizer has turned off
 * `Ride.participantsVisible` — checked for every caller, no organizer bypass.
 *
 * Deliberately narrower than the organizer's {@link listParticipants}: display name
 * (CR-125: `firstName`/`lastName` when set, else the free-text `displayName`) and
 * group only — no user id, registration id, email, phone or emergency data
 * (`.claude/rules/security.md`: "return unnecessary participant data" is a never).
 * Same active-only filter, `createdAt asc` order and cursor mechanics as
 * {@link listParticipants}; the opaque cursor is the only place a registration id
 * travels, and it grants nothing on its own.
 */
export async function listRiders(
  db: DbClient,
  userId: string,
  rideId: string,
  query: ListRidesQuery,
): Promise<ListRideRidersResponse> {
  const ride = await resolveVisibleRideStatus(db, userId, rideId);
  if (!ride.participantsVisible) {
    throw RIDERS_HIDDEN();
  }

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
    // Same `date_trunc` fix as {@link listParticipants} — see its comment.
    conditions.push(
      sql`(date_trunc('milliseconds', ${registrations.createdAt}), ${registrations.id}) > (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      id: registrations.id,
      createdAt: registrations.createdAt,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      groupId: registrations.groupId,
      groupName: rideGroups.name,
      groupPaceKmh: rideGroups.paceKmh,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .leftJoin(rideGroups, eq(registrations.groupId, rideGroups.id))
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

  return {
    items: page.map((row) => ({
      registrationId: row.id,
      displayName: resolveParticipantName(row),
      group: toGroupRef(row),
    })),
    nextCursor,
  };
}

/** CR-126: is `userId` an active rider of `rideId` — the "co_participants" check. */
async function hasActiveRegistration(
  db: DbClient,
  rideId: string,
  userId: string,
): Promise<boolean> {
  const [row] = await db
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
  return Boolean(row);
}

// CR-126: `/v1/rides/:id/riders/:registrationId/avatar`'s fixed path shape — same
// "computed from the key, not stored verbatim" precedent as `users.service.ts`'s
// own avatar path, just ride/registration-scoped instead of "me".
function riderAvatarUrlPath(rideId: string, registrationId: string): string {
  return `/v1/rides/${rideId}/riders/${registrationId}/avatar`;
}

/**
 * CR-126: the single access gate backing both {@link getRiderProfile} and
 * {@link getRiderAvatarDownload} — the tier logic lives here exactly once. Same
 * `404 ride_not_found`/`403 riders_hidden` as {@link listRiders} (the rider list
 * itself must be visible before any one card can be — except to the ride's own
 * organizer, CR-149: their cabinet links every participant's card, and
 * `participantsVisible` only hides the public list, not their own), then:
 * - the profile's own owner always sees it;
 * - the ride's organizer always sees it (they already have equal-or-greater
 *   access via {@link listParticipants}'s contact/emergency data);
 * - `profileVisibility: 'open'` grants any other signed-in viewer;
 * - `profileVisibility: 'co_participants'` grants a viewer with their own active
 *   registration on this same ride — sharing *this* ride is sufficient evidence
 *   of "co-participant", no need to search the viewer's whole ride history;
 * - `profileVisibility: 'closed'` never grants anyone but the owner.
 */
async function resolveRiderAccess(
  db: DbClient,
  viewerId: string,
  rideId: string,
  registrationId: string,
) {
  const ride = await resolveVisibleRideStatus(db, viewerId, rideId);
  const isOrganizer = ride.organizerUserId === viewerId;
  if (!ride.participantsVisible && !isOrganizer) {
    throw RIDERS_HIDDEN();
  }

  const [target] = await db
    .select({
      userId: registrations.userId,
      displayName: users.displayName,
      firstName: users.firstName,
      lastName: users.lastName,
      bio: users.bio,
      avatarKey: users.avatarKey,
      avatarContentType: users.avatarContentType,
      profileVisibility: users.profileVisibility,
      distanceWeekKm: users.distanceWeekKm,
      distanceMonthKm: users.distanceMonthKm,
      distanceYearKm: users.distanceYearKm,
    })
    .from(registrations)
    .innerJoin(users, eq(registrations.userId, users.id))
    .where(
      and(
        eq(registrations.id, registrationId),
        eq(registrations.rideId, rideId),
        eq(registrations.status, 'active'),
      ),
    )
    .limit(1);
  if (!target) {
    throw RIDER_NOT_FOUND();
  }

  const isSelf = target.userId === viewerId;
  const granted =
    isSelf ||
    isOrganizer ||
    target.profileVisibility === 'open' ||
    (target.profileVisibility === 'co_participants' &&
      (await hasActiveRegistration(db, rideId, viewerId)));
  if (!granted) {
    throw PROFILE_PRIVATE();
  }

  return target;
}

/**
 * CR-126: `GET /v1/rides/:id/riders/:registrationId/profile` — a participant's
 * card. Never exposes `phone`/`email` (`resolveRiderAccess`'s select doesn't even
 * fetch them) — those stay owner-only regardless of `profileVisibility`
 * (`.claude/rules/security.md`). "Recent rides" reuses `rides.participantsVisible`
 * as its one visibility rule, same flag `listRiders`/`resolveVisibleRideStatus`
 * already gate on, rather than a second concept.
 */
export async function getRiderProfile(
  db: DbClient,
  viewerId: string,
  rideId: string,
  registrationId: string,
): Promise<RiderProfile> {
  const target = await resolveRiderAccess(db, viewerId, rideId, registrationId);

  const bikeRows = await db
    .select()
    .from(userBikes)
    .where(eq(userBikes.userId, target.userId))
    .orderBy(desc(userBikes.isActive), asc(userBikes.createdAt));

  const recentRideRows = await db
    .select({ id: rides.id, title: rides.title, startsAt: rides.startsAt })
    .from(registrations)
    .innerJoin(rides, eq(registrations.rideId, rides.id))
    .where(
      and(
        eq(registrations.userId, target.userId),
        eq(registrations.status, 'active'),
        eq(rides.status, 'finished'),
        eq(rides.participantsVisible, true),
      ),
    )
    .orderBy(desc(rides.startsAt))
    .limit(5);

  return {
    registrationId,
    displayName: resolveParticipantName(target),
    bio: target.bio,
    avatarUrl: target.avatarKey
      ? riderAvatarUrlPath(rideId, registrationId)
      : null,
    bikes: bikeRows.map(toBike),
    distanceWeekKm: target.distanceWeekKm,
    distanceMonthKm: target.distanceMonthKm,
    distanceYearKm: target.distanceYearKm,
    recentRides: recentRideRows.map((row) => ({
      id: row.id,
      title: row.title,
      startsAt: row.startsAt.toISOString(),
    })),
  };
}

/**
 * CR-126: streams the rider's avatar bytes behind the same
 * {@link resolveRiderAccess} gate as {@link getRiderProfile} — the body behind
 * that response's `avatarUrl`.
 */
export async function getRiderAvatarDownload(
  db: DbClient,
  s3: S3Handle | null,
  viewerId: string,
  rideId: string,
  registrationId: string,
): Promise<{ body: Buffer; contentType: string }> {
  const target = await resolveRiderAccess(db, viewerId, rideId, registrationId);
  if (!target.avatarKey) {
    throw RIDER_AVATAR_NOT_FOUND();
  }

  try {
    const downloaded = await downloadImageObject(s3, target.avatarKey);
    return {
      body: downloaded.body,
      contentType: target.avatarContentType ?? 'application/octet-stream',
    };
  } catch (err) {
    if (err instanceof ImageStorageError)
      throw RIDER_AVATAR_STORAGE_UNAVAILABLE();
    throw err;
  }
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
 *
 * CR-193 (owner QA): the split is by the ride's status first, its date second.
 * A `finished`/`cancelled` ride (`ARCHIVED_RIDE_STATUSES`) is history whatever its
 * date — finished early or cancelled ahead of time, it is not something to come —
 * so it is `past`, where `startsAt desc` puts such a still-future-dated ride at the
 * top with its «Отменён»/«Завершён» badge. A `started` ride is `upcoming` even
 * once its start time has passed: it is under way, the rider may still need its
 * page (the finish check-in), and it stays there until the organizer finishes it —
 * the same rule as the organizer's «Заезды сейчас» (CR-183). The two predicates are
 * exact complements, so every active registration is in exactly one tab, and both
 * stay plain filters under the unchanged `(startsAt, id)` keyset.
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

  const notArchived = notInArray(rides.status, [...ARCHIVED_RIDE_STATUSES]);
  const conditions = [
    eq(registrations.userId, userId),
    eq(registrations.status, 'active'),
    isUpcoming
      ? and(
          notArchived,
          or(
            sql`${rides.startsAt} >= ${nowIso}::timestamptz`,
            eq(rides.status, 'started'),
          ),
        )!
      : or(
          inArray(rides.status, [...ARCHIVED_RIDE_STATUSES]),
          and(
            sql`${rides.startsAt} < ${nowIso}::timestamptz`,
            ne(rides.status, 'started'),
          ),
        )!,
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
      organizerAvatarKey: organizerProfiles.avatarKey,
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
            avatarUrl: row.organizerAvatarKey
              ? organizerAvatarUrlPath(row.organizerId)
              : null,
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
 * CR-083 ("Idempotency"): a call that lands after the caller already has an active
 * registration for this ride — most commonly a network retry of a register call that
 * actually succeeded, but the response never reached the client — is not an error.
 * `created: false` and the existing row are returned instead of throwing
 * `REGISTRATION_ALREADY_EXISTS()`; the caller (route layer) replies `200` rather than
 * `201`. The DB-level uniqueness invariant above is the backstop that makes this safe
 * under concurrent retries, not the client-facing design — that's the ticket's own
 * framing, and it stays true here: this function still never inserts a second row.
 *
 * CR-038 ("Registration confirmation", `.claude/context/current-task.md`): once
 * the transaction above has committed a *new* row, creates a `registration_confirmed`
 * notification for the new registrant — never inside the transaction itself
 * (`.claude/rules/resilience.md`: a non-critical side effect must never be able to
 * fail or roll back the critical action). Skipped on an idempotent replay
 * (`created: false`) — the registrant was already notified once, a retry must not
 * fan out a second notification for the same registration. A notification failure is
 * logged and swallowed by {@link createRegistrationConfirmedNotification} itself;
 * this function's own return value is unaffected either way.
 */
export async function createRegistration(
  db: DbClient,
  logger: NotificationLogger,
  queue: NotificationQueue | null,
  userId: string,
  rideId: string,
  groupId?: string,
): Promise<{ registration: Registration; created: boolean }> {
  // Resolves 404 vs. a later 409 correctly (visibility) before the lock.
  await resolveVisibleRideStatus(db, userId, rideId);

  const { row, created } = await db.transaction(async (tx) => {
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
      .select()
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
      return { row: existingActive, created: false };
    }

    // CR-117: after the idempotent-replay return above (a retry returns the
    // existing registration as-is, whatever group it carries — `PATCH .../register`
    // changes groups), before capacity: an invalid choice is the caller's input
    // error whether or not the ride is full. Capacity itself stays ride-level.
    const chosenGroupId = await resolveGroupChoice(tx, rideId, groupId);

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
      .values({ rideId, userId, status: 'active', groupId: chosenGroupId })
      .returning();
    if (!row) {
      throw new Error('Registration insert returned no row.');
    }
    return { row, created: true };
  });

  if (created) {
    await createRegistrationConfirmedNotification(
      db,
      logger,
      queue,
      userId,
      rideId,
    );
  }

  return { registration: toRegistration(row), created };
}

/**
 * CR-117: `PATCH /v1/rides/:id/register` — the caller moves their own active
 * registration to another group of the same ride. Under the same `rides` row lock as
 * every other registration write, so it can't race a group delete. `404
 * registration_not_found` without an active registration (covers a non-existent
 * ride the same way `cancelRegistration` does), `409 group_change_not_allowed` once
 * the ride is finished/cancelled, `422 group_not_found` for a group that isn't this
 * ride's.
 */
export async function updateRegistrationGroup(
  db: DbClient,
  userId: string,
  rideId: string,
  groupId: string,
): Promise<Registration> {
  const row = await db.transaction(async (tx) => {
    const [rideRow] = await tx
      .select({ status: rides.status })
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
    if (!rideRow || !existing) {
      throw REGISTRATION_NOT_FOUND();
    }
    if (rideRow.status === 'finished' || rideRow.status === 'cancelled') {
      throw GROUP_CHANGE_NOT_ALLOWED();
    }

    const chosenGroupId = await resolveGroupChoice(tx, rideId, groupId);
    const [updated] = await tx
      .update(registrations)
      .set({ groupId: chosenGroupId, updatedAt: new Date() })
      .where(eq(registrations.id, existing.id))
      .returning();
    if (!updated) {
      throw new Error('Registration update returned no row.');
    }
    return updated;
  });
  return toRegistration(row);
}

// CR-181 ("Finish self-check-in"): the ride statuses in which a finish may be
// claimed and decided. `finished` stays open on purpose — an organizer usually
// closes the ride before everyone has reported.
const ATTENDANCE_OPEN_STATUSES = new Set(['started', 'finished']);

/**
 * CR-181. The participant's own claim «I finished» on their own active
 * registration. Only a claim: it never touches `attendance`, so the organizer's
 * list is what turns it into a recorded finish. Idempotent — a repeat keeps the
 * first claim's timestamp. `404 registration_not_found` without an active
 * registration, `409 ride_not_in_progress` before the start or after a cancellation.
 */
export async function claimFinish(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<Registration> {
  const row = await db.transaction(async (tx) => {
    const [found] = await tx
      .select({ registration: registrations, rideStatus: rides.status })
      .from(registrations)
      .innerJoin(rides, eq(registrations.rideId, rides.id))
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.userId, userId),
          eq(registrations.status, 'active'),
        ),
      )
      .limit(1);
    if (!found) {
      throw REGISTRATION_NOT_FOUND();
    }
    if (!ATTENDANCE_OPEN_STATUSES.has(found.rideStatus)) {
      throw RIDE_NOT_IN_PROGRESS();
    }
    if (found.registration.finishClaimedAt) {
      return found.registration;
    }
    const [updated] = await tx
      .update(registrations)
      .set({ finishClaimedAt: new Date(), updatedAt: new Date() })
      .where(eq(registrations.id, found.registration.id))
      .returning();
    if (!updated) {
      throw new Error('Registration update returned no row.');
    }
    return updated;
  });
  return toRegistration(row);
}

/**
 * CR-181. Withdraws the caller's own claim. Idempotent; `409
 * attendance_already_decided` once the organizer has recorded an outcome — a
 * decision is theirs to change, not the participant's.
 */
export async function withdrawFinishClaim(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [found] = await tx
      .select({
        id: registrations.id,
        attendance: registrations.attendance,
        finishClaimedAt: registrations.finishClaimedAt,
      })
      .from(registrations)
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.userId, userId),
          eq(registrations.status, 'active'),
        ),
      )
      .limit(1);
    if (!found) {
      throw REGISTRATION_NOT_FOUND();
    }
    if (found.attendance !== null) {
      throw ATTENDANCE_ALREADY_DECIDED();
    }
    if (found.finishClaimedAt === null) {
      return;
    }
    await tx
      .update(registrations)
      .set({ finishClaimedAt: null, updatedAt: new Date() })
      .where(eq(registrations.id, found.id));
  });
}

// Owner gate + status gate for the organizer's attendance writes. `404
// ride_not_found` for a non-owner (same enumeration-safe answer as every other
// organizer-only endpoint), `409 ride_not_in_progress` outside started/finished.
async function assertOwnRideAttendanceOpen(
  tx: DbTransaction,
  userId: string,
  rideId: string,
): Promise<void> {
  const [row] = await tx
    .select({ status: rides.status })
    .from(rides)
    .innerJoin(organizerProfiles, eq(rides.organizerId, organizerProfiles.id))
    .where(and(eq(rides.id, rideId), eq(organizerProfiles.userId, userId)))
    .limit(1);
  if (!row) {
    throw RIDE_NOT_FOUND();
  }
  if (!ATTENDANCE_OPEN_STATUSES.has(row.status)) {
    throw RIDE_NOT_IN_PROGRESS();
  }
}

function attendanceValues(
  userId: string,
  attendance: RegistrationAttendance | null,
) {
  const now = new Date();
  return attendance === null
    ? {
        attendance: null,
        attendanceMarkedAt: null,
        attendanceMarkedBy: null,
        updatedAt: now,
      }
    : {
        attendance,
        attendanceMarkedAt: now,
        attendanceMarkedBy: userId,
        updatedAt: now,
      };
}

/**
 * CR-181. The organizer sets (or clears, with `null`) the outcome of the listed
 * participants — selective and batch confirmation are this one call with a
 * different id list. All-or-nothing: an id that is not an active registration of
 * *this* ride rolls the whole batch back (`404 participant_not_found`), so a
 * stale checkbox never half-applies. The organizer's user id comes from the
 * session and is stored as `attendanceMarkedBy`.
 */
export async function setAttendance(
  db: DbClient,
  userId: string,
  rideId: string,
  registrationIds: string[],
  attendance: RegistrationAttendance | null,
): Promise<number> {
  const ids = [...new Set(registrationIds)];
  return db.transaction(async (tx) => {
    await assertOwnRideAttendanceOpen(tx, userId, rideId);
    const updated = await tx
      .update(registrations)
      .set(attendanceValues(userId, attendance))
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.status, 'active'),
          inArray(registrations.id, ids),
        ),
      )
      .returning({ id: registrations.id });
    if (updated.length !== ids.length) {
      throw PARTICIPANT_NOT_FOUND();
    }
    return updated.length;
  });
}

/**
 * CR-181. «Confirm everyone who claimed a finish»: every active, still-undecided
 * registration of the ride that carries a claim becomes `finished`. A participant
 * the organizer already marked (e.g. `no_show`) is left alone. Returns the number
 * of rows changed — `0` is a valid answer, and a repeat call is a no-op.
 */
export async function confirmClaimedFinishes(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    await assertOwnRideAttendanceOpen(tx, userId, rideId);
    const updated = await tx
      .update(registrations)
      .set(attendanceValues(userId, 'finished'))
      .where(
        and(
          eq(registrations.rideId, rideId),
          eq(registrations.status, 'active'),
          isNotNull(registrations.finishClaimedAt),
          isNull(registrations.attendance),
        ),
      )
      .returning({ id: registrations.id });
    return updated.length;
  });
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
  queue: NotificationQueue | null,
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
      .select({
        id: waitlistEntries.id,
        userId: waitlistEntries.userId,
        groupId: waitlistEntries.groupId,
      })
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
      // CR-117: the group chosen when joining the queue carries over. It still
      // exists — `deleteRideGroup` refuses while a `waiting` entry references it.
      await tx.insert(registrations).values({
        rideId,
        userId: oldestWaiting.userId,
        status: 'active',
        groupId: oldestWaiting.groupId,
      });
    }
    return oldestWaiting?.userId ?? null;
  });

  if (promotedUserId) {
    await createRegistrationConfirmedNotification(
      db,
      logger,
      queue,
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
 *
 * CR-083 ("Idempotency"): a retry that lands after the caller already has a `waiting`
 * entry for this ride returns that existing entry (`created: false`) instead of
 * erroring — same reasoning as {@link createRegistration}'s own CR-083 doc comment.
 * This is *not* the same as the
 * `existingActive` check just above it: already having an *active registration* is a
 * genuine conflict (register/cancel instead of joining a queue for a spot that's
 * already theirs), not a retry of this call, so that branch still throws
 * `REGISTRATION_ALREADY_EXISTS()` unchanged.
 */
export async function joinWaitlist(
  db: DbClient,
  userId: string,
  rideId: string,
  groupId?: string,
): Promise<{ waitlistEntry: WaitlistEntry; created: boolean }> {
  await resolveVisibleRideStatus(db, userId, rideId);

  const { row, created } = await db.transaction(async (tx) => {
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
      .select()
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
      return { row: existingWaiting, created: false };
    }

    // CR-117: same group rules as `createRegistration` — the choice is made when
    // joining, so a promotion never produces a group-less registration on a ride
    // that has groups.
    const chosenGroupId = await resolveGroupChoice(tx, rideId, groupId);

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
      .values({ rideId, userId, status: 'waiting', groupId: chosenGroupId })
      .returning();
    if (!row) {
      throw new Error('Waitlist entry insert returned no row.');
    }
    return { row, created: true };
  });

  return { waitlistEntry: toWaitlistEntry(row), created };
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
