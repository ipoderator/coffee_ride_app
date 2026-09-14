import { and, desc, eq, sql } from 'drizzle-orm';
import { organizerProfiles, rides, users } from 'db/schema';
import type { DbClient } from 'db';
import type {
  CreateRideRequest,
  ListRidesQuery,
  ListRidesResponse,
  Ride,
  UpdateRideRequest,
} from 'types';
import {
  CursorError,
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '../../lib/cursor.js';

// Domain error the route layer maps to RFC 9457 — same pattern as
// `OrganizerServiceError`/`AuthServiceError` (`.claude/rules/backend.md`: route ->
// validation -> service -> repository).
export class RideServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'RideServiceError';
  }
}

const ORGANIZER_PROFILE_REQUIRED = () =>
  new RideServiceError(
    'organizer_profile_required',
    403,
    'Organizer profile required',
    'Create an organizer profile before creating a ride.',
  );

// CR-016 ("Organizer authorization", `.claude/context/current-task.md`): used for
// both "no such ride" and "exists but isn't yours" — deliberately the same response
// either way, so a non-owner can't distinguish the two
// (`.claude/rules/security.md`'s resource-enumeration reasoning, same as login's
// generic `invalid_credentials`).
const RIDE_NOT_FOUND = () =>
  new RideServiceError(
    'ride_not_found',
    404,
    'Ride not found',
    'No ride with that id exists for this account.',
  );

const RIDE_NOT_EDITABLE = () =>
  new RideServiceError(
    'ride_not_editable',
    409,
    'Ride is not editable',
    'Only a draft ride can be edited.',
  );

// CR-019 ("Publish ride"): a different action from `PATCH`, so a distinct code from
// `ride_not_editable` — covers both "already published" and any later lifecycle
// state (`registration_open`/.../`cancelled`).
const RIDE_NOT_PUBLISHABLE = () =>
  new RideServiceError(
    'ride_not_publishable',
    409,
    'Ride is not publishable',
    'Only a draft ride can be published.',
  );

// `.claude/rules/security.md`: "Require a verified email before an account can act
// as an organizer (publish a ride)". Same code as `organizers.service.ts`'s own
// `EMAIL_VERIFICATION_REQUIRED` (that file's local copy, not imported — each module
// owns its own domain-error factories, same pattern as `RIDE_NOT_FOUND` vs.
// organizers' `NOT_FOUND`) so `apps/web` can branch on one stable code regardless of
// which endpoint returned it.
const EMAIL_VERIFICATION_REQUIRED = () =>
  new RideServiceError(
    'email_verification_required',
    403,
    'Email verification required',
    'Verify your email before publishing a ride.',
  );

const INVALID_CURSOR = () =>
  new RideServiceError(
    'invalid_cursor',
    400,
    'Invalid cursor',
    'The cursor parameter is not a valid pagination cursor.',
  );

function toPublicRide(row: typeof rides.$inferSelect): Ride {
  return {
    id: row.id,
    organizerId: row.organizerId,
    title: row.title,
    description: row.description,
    coverImageUrl: row.coverImageUrl,
    bicycleType: row.bicycleType,
    startsAt: row.startsAt.toISOString(),
    startTimezone: row.startTimezone,
    participantLimit: row.participantLimit,
    priceRub: row.priceRub,
    distanceKm: row.distanceKm,
    elevationGainMeters: row.elevationGainMeters,
    paceKmh: row.paceKmh,
    durationMinutes: row.durationMinutes,
    difficulty: row.difficulty as Ride['difficulty'],
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  };
}

/**
 * Creates a minimal, valid draft `Ride` (CR-017, `.claude/context/current-task.md`) —
 * only `title`/`bicycleType`/`startsAt`/`startTimezone`; every other column stays
 * `null` until CR-018 ("Edit draft") fills it in.
 *
 * `userId` must come from the verified session only (`plugins/auth.ts`'s
 * `requireAuth`) — there is no client-supplied `organizerId`
 * (`.claude/rules/security.md`: never trust a client-supplied id). Resolved to the
 * caller's own `OrganizerProfile` here, the same "identity via a fresh DB read, not a
 * value passed in" discipline `organizers.service.ts` already uses for `emailVerified`.
 * 403s `organizer_profile_required` if the caller has none yet — this is NOT CR-016
 * ("Organizer authorization"): that ticket checks ownership of an *existing* ride on a
 * later mutation; this only establishes ownership at creation time.
 */
export async function createRide(
  db: DbClient,
  userId: string,
  input: CreateRideRequest,
): Promise<Ride> {
  const [organizerProfile] = await db
    .select({ id: organizerProfiles.id })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.userId, userId))
    .limit(1);
  if (!organizerProfile) {
    throw ORGANIZER_PROFILE_REQUIRED();
  }

  const [inserted] = await db
    .insert(rides)
    .values({
      organizerId: organizerProfile.id,
      title: input.title,
      bicycleType: input.bicycleType,
      startsAt: new Date(input.startsAt),
      startTimezone: input.startTimezone,
      updatedBy: userId,
    })
    .returning();
  if (!inserted) {
    throw new Error('Ride insert returned no row.');
  }
  return toPublicRide(inserted);
}

/**
 * The caller's own `OrganizerProfile.id`, or `null` if they don't have one yet —
 * shared by every "mine"/ownership-scoped query below so each one doesn't repeat the
 * same lookup.
 */
async function resolveOwnOrganizerProfileId(
  db: DbClient,
  userId: string,
): Promise<string | null> {
  const [profile] = await db
    .select({ id: organizerProfiles.id })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.userId, userId))
    .limit(1);
  return profile?.id ?? null;
}

/**
 * CR-088 ("Organizer rides list"): every ride owned by the caller, regardless of
 * status (unlike CR-024's future public list, which will only ever show
 * `published`+). No `OrganizerProfile` yet is an empty page, not an error — listing
 * "my rides" for someone who hasn't created any is a legitimate empty state, not a
 * guard condition (unlike `createRide`'s 403).
 *
 * Cursor pagination per ADR-011 (`apps/api/src/lib/cursor.ts`), sorted
 * `(createdAt desc, id desc)` — newest draft first, the natural order for a
 * management list.
 */
export async function listOwnRides(
  db: DbClient,
  userId: string,
  query: ListRidesQuery,
): Promise<ListRidesResponse> {
  const organizerProfileId = await resolveOwnOrganizerProfileId(db, userId);
  if (!organizerProfileId) {
    return { items: [], nextCursor: null };
  }

  const limit = clampLimit(query.limit);
  const conditions = [eq(rides.organizerId, organizerProfileId)];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    // The cursor's `createdAt` is passed as the ISO string it already is, not a `Date`
    // — the `postgres` driver only auto-serializes parameters bound through Drizzle's
    // own typed column helpers, not a raw JS `Date` interpolated into a hand-written
    // `sql` template (confirmed by a live query while building this: passing a `Date`
    // here throws `ERR_INVALID_ARG_TYPE` inside the driver's own parameter binding).
    conditions.push(
      sql`(${rides.createdAt}, ${rides.id}) < (${cursorKey.createdAt}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(rides)
    .where(and(...conditions))
    .orderBy(desc(rides.createdAt), desc(rides.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null;

  return { items: page.map(toPublicRide), nextCursor };
}

/**
 * CR-016 ("Organizer authorization"): resolves a single ride, scoped to the caller's
 * own `OrganizerProfile`. Throws `ride_not_found` (404) both when the id doesn't
 * exist at all and when it belongs to a different organizer — see the comment on
 * `RIDE_NOT_FOUND` above for why those two cases share one response.
 */
export async function getRideForOwner(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<Ride> {
  const organizerProfileId = await resolveOwnOrganizerProfileId(db, userId);
  if (!organizerProfileId) {
    throw RIDE_NOT_FOUND();
  }

  const [row] = await db
    .select()
    .from(rides)
    .where(and(eq(rides.id, rideId), eq(rides.organizerId, organizerProfileId)))
    .limit(1);
  if (!row) {
    throw RIDE_NOT_FOUND();
  }
  return toPublicRide(row);
}

/**
 * CR-018 ("Edit draft"): same ownership resolution as {@link getRideForOwner}, plus
 * the draft-only lifecycle gate (`ride_not_editable`, 409) — `docs/design.md` §8 names
 * this screen "Edit draft" specifically; publishing/cancelling/finishing are separate
 * tickets (CR-019/CR-021/CR-022) with their own transition rules.
 *
 * `patch` only contains keys the client actually sent (same PATCH semantics as
 * `organizers.service.ts`'s `updateOrganizerProfile`) — applied field-by-field rather
 * than spread, since `undefined` (omit) and `null` (clear) must be told apart for the
 * nullable columns, and a plain object spread can't distinguish "key absent" from
 * "key present with value `undefined`" once it's gone through JSON either way as
 * cleanly as an explicit per-field check.
 */
export async function updateRideDraft(
  db: DbClient,
  userId: string,
  rideId: string,
  patch: UpdateRideRequest,
): Promise<Ride> {
  const organizerProfileId = await resolveOwnOrganizerProfileId(db, userId);
  if (!organizerProfileId) {
    throw RIDE_NOT_FOUND();
  }

  const [existing] = await db
    .select({ status: rides.status })
    .from(rides)
    .where(and(eq(rides.id, rideId), eq(rides.organizerId, organizerProfileId)))
    .limit(1);
  if (!existing) {
    throw RIDE_NOT_FOUND();
  }
  if (existing.status !== 'draft') {
    throw RIDE_NOT_EDITABLE();
  }

  const values: Partial<typeof rides.$inferInsert> = {
    updatedAt: new Date(),
    updatedBy: userId,
  };
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.bicycleType !== undefined) values.bicycleType = patch.bicycleType;
  if (patch.startsAt !== undefined) values.startsAt = new Date(patch.startsAt);
  if (patch.startTimezone !== undefined)
    values.startTimezone = patch.startTimezone;
  if (patch.participantLimit !== undefined)
    values.participantLimit = patch.participantLimit;
  if (patch.priceRub !== undefined) values.priceRub = patch.priceRub;
  if (patch.distanceKm !== undefined) values.distanceKm = patch.distanceKm;
  if (patch.elevationGainMeters !== undefined)
    values.elevationGainMeters = patch.elevationGainMeters;
  if (patch.paceKmh !== undefined) values.paceKmh = patch.paceKmh;
  if (patch.durationMinutes !== undefined)
    values.durationMinutes = patch.durationMinutes;
  if (patch.difficulty !== undefined) values.difficulty = patch.difficulty;

  const [updated] = await db
    .update(rides)
    .set(values)
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) {
    throw new Error('Ride update returned no row.');
  }
  return toPublicRide(updated);
}

/**
 * CR-019 ("Publish ride"): `draft -> published`, the only transition this ticket
 * implements (`docs/product.md`'s lifecycle has further states —
 * `registration_open`/.../`cancelled` — but no ticket yet owns entering them; see
 * KI-025). Same ownership resolution as {@link getRideForOwner}/
 * {@link updateRideDraft} (404 `ride_not_found` either way, never 403, for a ride
 * that doesn't exist or isn't the caller's).
 *
 * Check order: ownership/existence (404) first — never leak whether a ride exists to
 * a non-owner — then the caller-level `emailVerified` capability gate (403,
 * `.claude/rules/security.md`), then the resource-state gate (409
 * `ride_not_publishable` unless still `draft`). `emailVerified` is read fresh from
 * `users` here, not trusted from whatever `request.user` captured at
 * session-validation time — same discipline `organizers.service.ts`'s
 * `createOrganizerProfile` already uses.
 */
export async function publishRide(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<Ride> {
  const organizerProfileId = await resolveOwnOrganizerProfileId(db, userId);
  if (!organizerProfileId) {
    throw RIDE_NOT_FOUND();
  }

  const [existing] = await db
    .select({ status: rides.status })
    .from(rides)
    .where(and(eq(rides.id, rideId), eq(rides.organizerId, organizerProfileId)))
    .limit(1);
  if (!existing) {
    throw RIDE_NOT_FOUND();
  }

  const [userRow] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) {
    throw new Error('Authenticated user row not found.');
  }
  if (!userRow.emailVerified) {
    throw EMAIL_VERIFICATION_REQUIRED();
  }

  if (existing.status !== 'draft') {
    throw RIDE_NOT_PUBLISHABLE();
  }

  const [updated] = await db
    .update(rides)
    .set({ status: 'published', updatedAt: new Date(), updatedBy: userId })
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) {
    throw new Error('Ride update returned no row.');
  }
  return toPublicRide(updated);
}
