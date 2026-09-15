import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { organizerProfiles, rides, routes, users } from 'db/schema';
import type { DbClient } from 'db';
import type {
  CreateRideRequest,
  GetRideResponse,
  GetRouteGeometryResponse,
  ListPublicRidesQuery,
  ListPublicRidesResponse,
  ListRidesQuery,
  ListRidesResponse,
  Ride,
  RouteGeometryPoint,
  RouteSummary,
  UpdateRideRequest,
} from 'types';
import {
  CursorError,
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '../../lib/cursor.js';
import { GpxParseError, parseGpx } from './gpx.js';
import {
  RouteStorageError,
  deleteGpxObject,
  downloadGpxObject,
  uploadGpxObject,
} from './route-storage.js';
import type { S3Handle } from '../../plugins/s3.js';

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

// CR-027 ("GPX upload"). `ROUTE_NOT_FOUND` is distinct from `RIDE_NOT_FOUND` — the
// ride itself was already resolved (ownership-checked) by the time this fires, it's
// specifically "this ride has no route yet".
const ROUTE_ALREADY_EXISTS = () =>
  new RideServiceError(
    'route_already_exists',
    409,
    'Route already exists',
    'This ride already has a route — use PATCH to replace it.',
  );

const ROUTE_NOT_FOUND = () =>
  new RideServiceError(
    'route_not_found',
    404,
    'Route not found',
    'This ride has no route uploaded yet.',
  );

const GPX_FILE_MISSING = () =>
  new RideServiceError(
    'gpx_file_missing',
    400,
    'GPX file missing',
    'Upload a .gpx file in the "file" field.',
  );

const GPX_INVALID = (detail: string) =>
  new RideServiceError('gpx_invalid', 400, 'Invalid GPX file', detail);

// `.claude/rules/resilience.md`: a degraded-storage response, not a generic 500 —
// covers both "S3 not configured in this environment" and "the call to S3 failed"
// (`route-storage.ts`'s `RouteStorageError` covers both uniformly).
const ROUTE_STORAGE_UNAVAILABLE = () =>
  new RideServiceError(
    'route_storage_unavailable',
    503,
    'Route storage unavailable',
    'File storage is temporarily unavailable. Try again shortly.',
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
    startLat: row.startLat,
    startLng: row.startLng,
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

function toRouteSummary(row: typeof routes.$inferSelect): RouteSummary {
  return {
    id: row.id,
    rideId: row.rideId,
    gpxFileName: row.gpxFileName,
    gpxFileSizeBytes: row.gpxFileSizeBytes,
    distanceKm: row.distanceKm,
    elevationGainMeters: row.elevationGainMeters,
    pointCount: row.pointCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
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
    // The cursor's `sortValue` is passed as the ISO string it already is, not a `Date`
    // — the `postgres` driver only auto-serializes parameters bound through Drizzle's
    // own typed column helpers, not a raw JS `Date` interpolated into a hand-written
    // `sql` template (confirmed by a live query while building this: passing a `Date`
    // here throws `ERR_INVALID_ARG_TYPE` inside the driver's own parameter binding).
    conditions.push(
      sql`(${rides.createdAt}, ${rides.id}) < (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
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
      ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
      : null;

  return { items: page.map(toPublicRide), nextCursor };
}

/**
 * CR-024 ("Ride list", public discovery), extended by CR-025 ("Filters"): every
 * upcoming ride that has left `draft`, for *any* viewer — unlike {@link listOwnRides},
 * no session is ever consulted (`docs/api.md`: "no auth"), so there is no
 * owner-sees-their-own-drafts exception like {@link getRideForViewer}'s. "published+"
 * means the same thing here as it does for `GET /v1/rides/:id`: any status except
 * `draft` (`.claude/context/current-task.md`).
 *
 * CR-025 made "upcoming" (`startsAt >= now`, computed fresh per call) an
 * unconditional part of this endpoint, not a toggleable filter — a discovery screen
 * has no named use case for surfacing already-started/finished rides
 * (`docs/product.md` Principle 3, "Live status, not stale coordination"). This also
 * resolves KI-029: with past rides excluded, `startsAt asc` (soonest-first) is the
 * correct default sort — unlike `/mine`, which stays `createdAt desc`
 * ({@link listOwnRides}, a management list, unaffected by this ticket).
 *
 * `bicycleType` narrows to one enum value when provided — the one filter dimension
 * this ticket ships (`.claude/context/current-task.md`).
 *
 * Each item carries its organizer's public `{ id, name }`, same join
 * {@link getRideForViewer} already does for a single ride.
 */
export async function listPublicRides(
  db: DbClient,
  query: ListPublicRidesQuery,
): Promise<ListPublicRidesResponse> {
  const limit = clampLimit(query.limit);
  const conditions = [
    ne(rides.status, 'draft'),
    gte(rides.startsAt, new Date()),
  ];
  if (query.bicycleType) {
    conditions.push(eq(rides.bicycleType, query.bicycleType));
  }
  // CR-026 ("Map discovery"), ADR-014: a map-viewport (bbox) filter — the request
  // schema (`listPublicRidesQuerySchema`) already guarantees all four params arrive
  // together or not at all. A ride with no coordinates can't be placed on the map, so
  // it's excluded here — but only when a bbox filter is active; the plain,
  // unfiltered list is unaffected (`.claude/rules/resilience.md`: "the ride can still
  // be created/viewed without geocoded coordinates").
  if (
    query.bboxNorth !== undefined &&
    query.bboxSouth !== undefined &&
    query.bboxEast !== undefined &&
    query.bboxWest !== undefined
  ) {
    conditions.push(
      isNotNull(rides.startLat),
      isNotNull(rides.startLng),
      gte(rides.startLat, query.bboxSouth),
      lte(rides.startLat, query.bboxNorth),
      gte(rides.startLng, query.bboxWest),
      lte(rides.startLng, query.bboxEast),
    );
  }
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    // Ascending pagination (soonest-first): the next page needs rows *after* the
    // last one seen, so `>` here — the inverse of `listOwnRides`'s `<` (which pages
    // through its `desc` order).
    conditions.push(
      sql`(${rides.startsAt}, ${rides.id}) > (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
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
    .orderBy(asc(rides.startsAt), asc(rides.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({
          sortValue: last.ride.startsAt.toISOString(),
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

  // CR-027 ("GPX upload"): additive `route` summary, `null` until one is uploaded.
  const [routeRow] = await db
    .select()
    .from(routes)
    .where(eq(routes.rideId, rideId))
    .limit(1);

  return {
    ride: toPublicRide(row.ride),
    organizer: { id: row.organizerId, name: row.organizerName },
    route: routeRow ? toRouteSummary(routeRow) : null,
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
  if (patch.startLat !== undefined) values.startLat = patch.startLat;
  if (patch.startLng !== undefined) values.startLng = patch.startLng;
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

/**
 * Ownership + draft-only gate shared by every route mutation below — same rule
 * {@link updateRideDraft} uses (`.claude/context/current-task.md`: route
 * configuration is part of the same pre-publish setup, no named use case for
 * post-publish route edits yet).
 */
async function resolveOwnDraftRide(
  db: DbClient,
  userId: string,
  rideId: string,
): Promise<void> {
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
}

function parseUploadedGpx(buffer: Buffer) {
  try {
    return parseGpx(buffer.toString('utf-8'));
  } catch (err) {
    if (err instanceof GpxParseError) throw GPX_INVALID(err.message);
    throw err;
  }
}

/**
 * CR-027 ("GPX upload"): parses and stores a new GPX track for a ride that has none
 * yet. 409 `route_already_exists` if one is already present — use
 * {@link replaceRoute} instead. S3 failure (or S3 not configured — KI-015) surfaces
 * as `503 route_storage_unavailable`, never a generic 500
 * (`.claude/rules/resilience.md`).
 *
 * CR-029 ("Route metadata", resolves KI-034): in the same transaction as the route
 * insert, auto-fills `Ride.distanceKm`/`elevationGainMeters` from the parsed GPX —
 * but only for whichever of the two is still `null`. Never overwrites a value the
 * organizer already entered (CR-018), and never runs again on {@link replaceRoute} —
 * by then `Ride`'s fields already reflect *something* (an entry or a prior auto-fill)
 * that a silent re-fill would indistinguishably clobber.
 */
export async function uploadRoute(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
  rideId: string,
  file: { filename: string; buffer: Buffer } | null,
): Promise<RouteSummary> {
  if (!file) {
    throw GPX_FILE_MISSING();
  }
  await resolveOwnDraftRide(db, userId, rideId);

  const [existingRoute] = await db
    .select({ id: routes.id })
    .from(routes)
    .where(eq(routes.rideId, rideId))
    .limit(1);
  if (existingRoute) {
    throw ROUTE_ALREADY_EXISTS();
  }

  const parsed = parseUploadedGpx(file.buffer);
  const key = `routes/${rideId}/${randomUUID()}.gpx`;
  try {
    await uploadGpxObject(s3, key, file.buffer);
  } catch (err) {
    if (err instanceof RouteStorageError) throw ROUTE_STORAGE_UNAVAILABLE();
    throw err;
  }

  const inserted = await db.transaction(async (tx) => {
    const [route] = await tx
      .insert(routes)
      .values({
        rideId,
        gpxFileKey: key,
        gpxFileName: file.filename,
        gpxFileSizeBytes: file.buffer.byteLength,
        distanceKm: parsed.distanceKm,
        elevationGainMeters: parsed.elevationGainMeters,
        pointCount: parsed.pointCount,
        geometry: parsed.geometry,
        updatedBy: userId,
      })
      .returning();
    if (!route) {
      throw new Error('Route insert returned no row.');
    }

    const [currentRide] = await tx
      .select({
        distanceKm: rides.distanceKm,
        elevationGainMeters: rides.elevationGainMeters,
      })
      .from(rides)
      .where(eq(rides.id, rideId))
      .limit(1);
    const ridePatch: Partial<typeof rides.$inferInsert> = {};
    if (currentRide?.distanceKm === null) {
      ridePatch.distanceKm = parsed.distanceKm;
    }
    if (currentRide?.elevationGainMeters === null) {
      ridePatch.elevationGainMeters = parsed.elevationGainMeters;
    }
    if (Object.keys(ridePatch).length > 0) {
      await tx
        .update(rides)
        .set({ ...ridePatch, updatedAt: new Date(), updatedBy: userId })
        .where(eq(rides.id, rideId));
    }

    return route;
  });

  return toRouteSummary(inserted);
}

/**
 * CR-027: replaces an existing route's GPX file. 404 `route_not_found` if none
 * exists yet — use {@link uploadRoute} instead. The old S3 object is deleted only
 * after the DB row points at the new one, and only best-effort (a failed delete
 * leaves an orphaned object, logged by the caller, never blocks the replace —
 * `.claude/rules/resilience.md`: the DB row is the source of truth for which file is
 * current).
 */
export async function replaceRoute(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
  rideId: string,
  file: { filename: string; buffer: Buffer } | null,
): Promise<RouteSummary> {
  if (!file) {
    throw GPX_FILE_MISSING();
  }
  await resolveOwnDraftRide(db, userId, rideId);

  const [existingRoute] = await db
    .select()
    .from(routes)
    .where(eq(routes.rideId, rideId))
    .limit(1);
  if (!existingRoute) {
    throw ROUTE_NOT_FOUND();
  }

  const parsed = parseUploadedGpx(file.buffer);
  const key = `routes/${rideId}/${randomUUID()}.gpx`;
  try {
    await uploadGpxObject(s3, key, file.buffer);
  } catch (err) {
    if (err instanceof RouteStorageError) throw ROUTE_STORAGE_UNAVAILABLE();
    throw err;
  }

  const [updated] = await db
    .update(routes)
    .set({
      gpxFileKey: key,
      gpxFileName: file.filename,
      gpxFileSizeBytes: file.buffer.byteLength,
      distanceKm: parsed.distanceKm,
      elevationGainMeters: parsed.elevationGainMeters,
      pointCount: parsed.pointCount,
      geometry: parsed.geometry,
      updatedAt: new Date(),
      updatedBy: userId,
    })
    .where(eq(routes.id, existingRoute.id))
    .returning();
  if (!updated) {
    throw new Error('Route update returned no row.');
  }

  try {
    await deleteGpxObject(s3, existingRoute.gpxFileKey);
  } catch {
    // Best-effort — see the function's own doc comment.
  }

  return toRouteSummary(updated);
}

/**
 * CR-027: removes a ride's route. 404 `route_not_found` if none exists. The DB row
 * is deleted first — S3 cleanup is best-effort and never blocks the delete
 * (`.claude/rules/resilience.md`).
 */
export async function deleteRoute(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
  rideId: string,
): Promise<void> {
  await resolveOwnDraftRide(db, userId, rideId);

  const [existingRoute] = await db
    .select({ id: routes.id, gpxFileKey: routes.gpxFileKey })
    .from(routes)
    .where(eq(routes.rideId, rideId))
    .limit(1);
  if (!existingRoute) {
    throw ROUTE_NOT_FOUND();
  }

  await db.delete(routes).where(eq(routes.id, existingRoute.id));

  try {
    await deleteGpxObject(s3, existingRoute.gpxFileKey);
  } catch {
    // Best-effort — see `replaceRoute`'s doc comment.
  }
}

/**
 * CR-027: streams the raw GPX file back. Same viewer-visibility rule as
 * {@link getRideForViewer} (owner always, others only once the ride has left
 * `draft`) — route download is part of the same "complete ride record" a viewer can
 * already see, not a separate, more-restricted capability.
 */
export async function getRouteDownload(
  db: DbClient,
  s3: S3Handle | null,
  userId: string | null,
  rideId: string,
): Promise<{ body: Buffer; filename: string }> {
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

  const isOwner = userId !== null && row.organizerUserId === userId;
  if (!isOwner && row.status === 'draft') {
    throw RIDE_NOT_FOUND();
  }

  const [routeRow] = await db
    .select({ gpxFileKey: routes.gpxFileKey, gpxFileName: routes.gpxFileName })
    .from(routes)
    .where(eq(routes.rideId, rideId))
    .limit(1);
  if (!routeRow) {
    throw ROUTE_NOT_FOUND();
  }

  try {
    const downloaded = await downloadGpxObject(s3, routeRow.gpxFileKey);
    return { body: downloaded.body, filename: routeRow.gpxFileName };
  } catch (err) {
    if (err instanceof RouteStorageError) throw ROUTE_STORAGE_UNAVAILABLE();
    throw err;
  }
}

/**
 * CR-028 ("Route rendering"), resolving KI-035: the full ordered point array behind
 * `GetRideResponse.route`'s summary. Same viewer-visibility rule as
 * {@link getRouteDownload} — but unlike it, no S3 call: `Route.geometry` is already in
 * the DB row from CR-027's upload, so there is no `route_storage_unavailable` case
 * here.
 */
export async function getRouteGeometry(
  db: DbClient,
  userId: string | null,
  rideId: string,
): Promise<GetRouteGeometryResponse> {
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

  const isOwner = userId !== null && row.organizerUserId === userId;
  if (!isOwner && row.status === 'draft') {
    throw RIDE_NOT_FOUND();
  }

  const [routeRow] = await db
    .select({ geometry: routes.geometry })
    .from(routes)
    .where(eq(routes.rideId, rideId))
    .limit(1);
  if (!routeRow) {
    throw ROUTE_NOT_FOUND();
  }

  return { points: routeRow.geometry as RouteGeometryPoint[] };
}
