import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { organizerProfiles, rides, users } from 'db/schema';
import type { DbClient } from 'db';
import type {
  CreateRideRequest,
  GetRideResponse,
  ListPublicRidesResponse,
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

// CR-089 ("Open registration"): distinct from `ride_not_publishable` — a different
// action, different guard (`published` only, not `draft`).
const RIDE_REGISTRATION_NOT_OPENABLE = () =>
  new RideServiceError(
    'ride_registration_not_openable',
    409,
    'Ride registration is not openable',
    'Only a published ride can have registration opened.',
  );

// CR-020 ("Close registration"): distinct from the other two 409 codes above — guard
// is `registration_open` only.
const RIDE_REGISTRATION_NOT_CLOSABLE = () =>
  new RideServiceError(
    'ride_registration_not_closable',
    409,
    'Ride registration is not closable',
    'Only a ride with open registration can have it closed.',
  );

// CR-021 ("Cancel ride"): distinct from every other 409 code above — the only
// transition with three valid source statuses at once (`docs/product.md`'s
// Lifecycle: `published/registration_open/registration_closed -> cancelled`), so this
// one code covers `draft`/`started`/`finished`/already-`cancelled` alike.
const RIDE_NOT_CANCELLABLE = () =>
  new RideServiceError(
    'ride_not_cancellable',
    409,
    'Ride is not cancellable',
    'Only a published, registration-open, or registration-closed ride can be cancelled.',
  );

// CR-090 ("Start ride") / CR-022 ("Finish ride"): one code per action, same
// convention as every other ride-lifecycle transition.
const RIDE_NOT_STARTABLE = () =>
  new RideServiceError(
    'ride_not_startable',
    409,
    'Ride is not startable',
    'Only a ride with closed registration can be started.',
  );

const RIDE_NOT_FINISHABLE = () =>
  new RideServiceError(
    'ride_not_finishable',
    409,
    'Ride is not finishable',
    'Only a started ride can be finished.',
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
 * CR-024 ("Ride list", public discovery): every ride that has left `draft`, for
 * *any* viewer — unlike {@link listOwnRides}, no session is ever consulted
 * (`docs/api.md`: "no auth"), so there is no owner-sees-their-own-drafts exception
 * like {@link getRideForViewer}'s. "published+" means the same thing here as it does
 * there: any status except `draft` (`.claude/context/current-task.md`).
 *
 * Same cursor pagination and `(createdAt desc, id desc)` sort key as
 * {@link listOwnRides} — `apps/api/src/lib/cursor.ts` anticipated this endpoint
 * reusing it. Each item carries its organizer's public `{ id, name }`, same join
 * {@link getRideForViewer} already does for a single ride.
 */
export async function listPublicRides(
  db: DbClient,
  query: ListRidesQuery,
): Promise<ListPublicRidesResponse> {
  const limit = clampLimit(query.limit);
  const conditions = [ne(rides.status, 'draft')];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    conditions.push(
      sql`(${rides.createdAt}, ${rides.id}) < (${cursorKey.createdAt}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select({
      ride: rides,
      organizerId: organizerProfiles.id,
      organizerName: organizerProfiles.name,
    })
    .from(rides)
    .innerJoin(organizerProfiles, eq(rides.organizerId, organizerProfiles.id))
    .where(and(...conditions))
    .orderBy(desc(rides.createdAt), desc(rides.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          createdAt: last.ride.createdAt.toISOString(),
          id: last.ride.id,
        })
      : null;

  return {
    items: page.map((row) => ({
      ...toPublicRide(row.ride),
      organizer: { id: row.organizerId, name: row.organizerName },
    })),
    nextCursor,
  };
}

/**
 * CR-016/CR-018 ("Organizer authorization"/"Edit draft") originally, now CR-023
 * ("Ride detail") too: resolves a single ride for *any* viewer, owner or not.
 *
 * `userId` is `null` for an unauthenticated request (`resolveOptionalUser`,
 * `plugins/auth.ts`) — never rejected outright, unlike every other `rides.service.ts`
 * function. Visibility rule (`.claude/context/current-task.md`'s investigation):
 * - the ride's own organizer (resolved server-side from the session, never a
 *   client-supplied id) sees it at any status, same as the pre-CR-023 owner-only
 *   behavior;
 * - anyone else (including no session at all) sees it unless it's still `draft` —
 *   `404 ride_not_found`, the same response `RIDE_NOT_FOUND` already used for "doesn't
 *   exist"/"exists but isn't yours", so a draft's existence is never revealed to a
 *   non-owner either way.
 *
 * Returns the organizer's public `{ id, name }` alongside the ride
 * (`docs/product.md` Principle 2: "complete ride record, not a link out" — no separate
 * public organizer-read endpoint exists or is needed for just this).
 */
export async function getRideForViewer(
  db: DbClient,
  userId: string | null,
  rideId: string,
): Promise<GetRideResponse> {
  const [row] = await db
    .select({
      ride: rides,
      organizerId: organizerProfiles.id,
      organizerName: organizerProfiles.name,
      organizerUserId: organizerProfiles.userId,
    })
    .from(rides)
    .innerJoin(organizerProfiles, eq(rides.organizerId, organizerProfiles.id))
    .where(eq(rides.id, rideId))
    .limit(1);
  if (!row) {
    throw RIDE_NOT_FOUND();
  }

  const isOwner = userId !== null && row.organizerUserId === userId;
  if (!isOwner && row.ride.status === 'draft') {
    throw RIDE_NOT_FOUND();
  }

  return {
    ride: toPublicRide(row.ride),
    organizer: { id: row.organizerId, name: row.organizerName },
  };
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

/**
 * CR-089 ("Open registration"): `published -> registration_open`, resolving KI-025
 * (nothing previously transitioned a ride into `registration_open` at all). Same
 * ownership resolution as {@link publishRide} (404 `ride_not_found` either way), but
 * no `emailVerified` gate — `.claude/rules/security.md` names only the publish action,
 * and there is no de-verification flow that could make an already-published ride's
 * organizer newly unverified.
 */
export async function openRegistration(
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
  if (existing.status !== 'published') {
    throw RIDE_REGISTRATION_NOT_OPENABLE();
  }

  const [updated] = await db
    .update(rides)
    .set({
      status: 'registration_open',
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) {
    throw new Error('Ride update returned no row.');
  }
  return toPublicRide(updated);
}

/**
 * CR-020 ("Close registration"): `registration_open -> registration_closed`. Same
 * ownership resolution and no-`emailVerified`-gate reasoning as
 * {@link openRegistration}.
 */
export async function closeRegistration(
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
  if (existing.status !== 'registration_open') {
    throw RIDE_REGISTRATION_NOT_CLOSABLE();
  }

  const [updated] = await db
    .update(rides)
    .set({
      status: 'registration_closed',
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) {
    throw new Error('Ride update returned no row.');
  }
  return toPublicRide(updated);
}

const CANCELLABLE_STATUSES = [
  'published',
  'registration_open',
  'registration_closed',
] as const;

/**
 * CR-021 ("Cancel ride"): `published/registration_open/registration_closed ->
 * cancelled` (`docs/product.md`'s Lifecycle section) — the only transition with more
 * than one valid source status. Same ownership resolution as every other transition
 * (404 `ride_not_found` either way), no `emailVerified` gate (same reasoning as
 * {@link openRegistration}/{@link closeRegistration} — only `publish` is named by
 * `.claude/rules/security.md`).
 */
export async function cancelRide(
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
  if (
    !CANCELLABLE_STATUSES.includes(
      existing.status as (typeof CANCELLABLE_STATUSES)[number],
    )
  ) {
    throw RIDE_NOT_CANCELLABLE();
  }

  const [updated] = await db
    .update(rides)
    .set({ status: 'cancelled', updatedAt: new Date(), updatedBy: userId })
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) {
    throw new Error('Ride update returned no row.');
  }
  return toPublicRide(updated);
}

/**
 * CR-090 ("Start ride"): `registration_closed -> started`, resolving KI-027
 * (nothing previously transitioned a ride into `started` at all — same shape of gap
 * as KI-024/KI-025). Same ownership resolution as every other transition (404
 * `ride_not_found` either way), no `emailVerified` gate.
 */
export async function startRide(
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
  if (existing.status !== 'registration_closed') {
    throw RIDE_NOT_STARTABLE();
  }

  const [updated] = await db
    .update(rides)
    .set({ status: 'started', updatedAt: new Date(), updatedBy: userId })
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) {
    throw new Error('Ride update returned no row.');
  }
  return toPublicRide(updated);
}

/**
 * CR-022 ("Finish ride"): `started -> finished`, the last lifecycle transition. Same
 * ownership resolution and no-`emailVerified`-gate reasoning as {@link startRide}.
 */
export async function finishRide(
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
  if (existing.status !== 'started') {
    throw RIDE_NOT_FINISHABLE();
  }

  const [updated] = await db
    .update(rides)
    .set({ status: 'finished', updatedAt: new Date(), updatedBy: userId })
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) {
    throw new Error('Ride update returned no row.');
  }
  return toPublicRide(updated);
}
