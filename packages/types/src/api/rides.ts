import { z } from 'zod';
import { BICYCLE_TYPES, type Ride } from '../domain/ride.js';
import type { RouteGeometryPoint, RouteSummary } from '../domain/route.js';
import type { Stop } from '../domain/stop.js';
import { ROUTE_POINT_TYPES, type RoutePoint } from '../domain/route-point.js';
import type { Registration } from '../domain/registration.js';
import type { WaitlistEntry } from '../domain/waitlist-entry.js';
import type { Review } from '../domain/review.js';
import type { Paginated } from './pagination.js';
import type { RideGroupSummary } from './ride-groups.js';

// `Intl.DateTimeFormat` throws `RangeError` for a `timeZone` it doesn't recognize —
// the standard way to validate an IANA identifier without a timezone-database
// dependency (`.claude/rules/resilience.md`'s "no dependency without justification"
// spirit — Node/the browser already carry tzdata). Loose on purpose, same tier as
// CR-013's phone validation: any zone `Intl` recognizes is accepted server-side, even
// though the web picker only offers Russia's 11 (`docs/product.md`'s market/locale is
// Russian, `RUSSIAN_TIMEZONE_OPTIONS` in `packages/ui`) — the API contract itself
// isn't narrowed to that list.
function isValidIanaTimeZone(value: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

// CR-017 ("Create ride", `.claude/context/current-task.md`): only the fields a valid
// draft needs at creation time. `description`/capacity/price/distance/duration/pace/
// elevation/difficulty/cover image are all nullable on the `Ride` row and filled in by
// CR-018 ("Edit draft") — not part of this request.
export const createRideRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title cannot be empty.')
    .max(140, 'Title must be at most 140 characters.'),
  bicycleType: z.enum(
    BICYCLE_TYPES,
    'bicycleType must be one of: road, gravel, mtb, any.',
  ),
  // ADR-012: the instant, already converted to UTC by the client from the entered
  // local wall-clock time + `startTimezone` (`apps/web/src/lib/datetime/
  // zoned-time.ts`) — this field alone doesn't carry "what did the organizer mean",
  // `startTimezone` below does.
  startsAt: z.iso.datetime(
    'startsAt must be an ISO 8601 date-time (e.g. with a Z or offset).',
  ),
  startTimezone: z
    .string()
    .trim()
    .min(1, 'Start timezone is required.')
    .refine(
      isValidIanaTimeZone,
      'Start timezone must be a valid IANA time zone identifier.',
    ),
});
export type CreateRideRequest = z.infer<typeof createRideRequestSchema>;

export interface CreateRideResponse {
  ride: Ride;
}

// CR-023 ("Ride detail"): the ride's public organizer identity, embedded directly in
// `GET /v1/rides/:id`'s response rather than a separate public organizer-read
// endpoint — `docs/product.md` Principle 2, "complete ride record, not a link out"
// (`.claude/context/current-task.md`).
// CR-043 ("Organizer rating summary"): additive `rating`/`reviewCount`, aggregated
// from `Review` rows across every ride this organizer has run — same "embed it here,
// no new endpoint" precedent, reusing this one shared type rather than minting a
// separate organizer-rating shape (`.claude/CLAUDE.md`: "Do not create duplicate
// concepts under different names"). `rating` is `null` with `reviewCount: 0` when the
// organizer has no reviews yet — never `0` (`docs/design.md` §6: a missing value and
// a real zero are different facts).
// CR-097 (KI-023 remainder): additive `avatarUrl`, same "embed it here" precedent
// as `rating`/`reviewCount` (CR-043) — `RideCard`/organizer identity needs a photo
// alongside the name, and there is still no separate public organizer-read
// endpoint. `null` when the organizer has no avatar uploaded.
export interface RideOrganizerSummary {
  id: string;
  name: string;
  avatarUrl: string | null;
  rating: number | null;
  reviewCount: number;
}

// CR-023: `GET /v1/rides/:id`'s response shape, extended from a bare `{ ride }` —
// additive (existing owner-only consumers destructuring `{ ride }` are unaffected).
// CR-027 ("GPX upload") added `route` — a summary only (no `geometry` array), same
// additive-field discipline; `null` when no GPX has been uploaded yet.
// CR-030 ("Stops"): additive `stops` array, ordered by `position` — same "no separate
// read endpoint, embed it in the ride detail response" precedent as `route` (CR-027).
// CR-031 ("Route points"): additive `routePoints` array, same embedding precedent —
// ordered by `createdAt` (display order isn't meaningful for typed map pins, unlike
// `stops`' `position`).
// CR-032 ("Register"): additive `registrationsCount` (active registrations for this
// ride — `.claude/rules/database.md`: "Live status, not stale coordination") and
// `viewerRegistration` (the caller's own active registration, `null` if none or
// unauthenticated) — same "no separate read endpoint, embed it" precedent as
// `route`/`stops`/`routePoints`.
// CR-036 ("Waitlist"): additive `viewerWaitlistEntry` (the caller's own `waiting`
// queue entry, `null` if none/unauthenticated/promoted/cancelled) — same precedent.
// No `waitlistCount` this ticket — nothing participant-facing needs a total queue
// size yet (`.claude/context/current-task.md`).
// CR-042 ("Review"): additive `viewerReview` (the caller's own review for this ride,
// `null` if none/unauthenticated) — same "embed the caller's own state" precedent as
// `viewerRegistration`/`viewerWaitlistEntry`. Lets `ReviewForm` decide "already
// reviewed" without a second request or guessing from the public review list.
export interface GetRideResponse {
  ride: Ride;
  organizer: RideOrganizerSummary;
  route: RouteSummary | null;
  stops: Stop[];
  routePoints: RoutePoint[];
  registrationsCount: number;
  viewerRegistration: Registration | null;
  viewerWaitlistEntry: WaitlistEntry | null;
  viewerReview: Review | null;
  // CR-117 ("Pace groups"): additive, ordered by `position`; `[]` when the ride has
  // none. `viewerRegistration.groupId` says which one the caller is in.
  groups: RideGroupSummary[];
}

// CR-088 ("Organizer rides list", `.claude/context/current-task.md`): first real
// collection endpoint (`GET /v1/rides/mine`) — cursor pagination per ADR-011.
// `cursor` is opaque (`apps/api/src/lib/cursor.ts` encodes/decodes it) — never parsed
// client-side, so it's just `z.string()` here, not a structured shape.
export const listRidesQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional(),
  cursor: z.string().min(1).optional(),
});
export type ListRidesQuery = z.infer<typeof listRidesQuerySchema>;

export type ListRidesResponse = Paginated<Ride>;

// CR-103 (`/impeccable critique` P1 — "organizer dashboard has no glanceable
// status"): `GET /v1/rides/mine/summary`, a single-resource aggregate sibling of
// `/mine`'s paginated list, not a collection itself — no pagination per ADR-011.
export interface OrganizerRideSummary {
  totalRides: number;
  draftRides: number;
  openRegistrationRides: number;
  activeRegistrations: number;
  waitlisted: number;
}
export interface GetOrganizerRideSummaryResponse {
  summary: OrganizerRideSummary;
}

// CR-024 ("Ride list", public discovery): `GET /v1/rides` — unlike `/mine`, this
// endpoint is fully public (no session ever consulted) and only ever returns
// non-`draft` rides (`.claude/context/current-task.md`'s "published+" rule, same one
// CR-023 established for `GET /v1/rides/:id`). Each item carries its organizer's
// public identity, same reasoning as `GetRideResponse` (`docs/product.md` Principle
// 2: "complete ride record, not a link out") — a `RideCard` needs the organizer's
// name and there is still no separate public organizer-read endpoint.
export type PublicRide = Ride & { organizer: RideOrganizerSummary };

// CR-116 (discovery «Топокарта» cards): `GET /v1/rides` items only — additive on
// top of `PublicRide`, which `GET /v1/registrations/mine` keeps reusing unchanged.
// Computed in batch per page, never per row (`rides.service.ts`'s
// `getRideListExtras`).
// - `registrationsCount`: active registrations, same count `GetRideResponse` has.
// - `startLabel`: label of the ride's `start` route point, `null` if none/unlabelled.
// - `routePreview`: the stored route geometry simplified to at most
//   `ROUTE_PREVIEW_MAX_POINTS` `[lat, lng]` pairs (for a small inline sketch, not
//   for navigation), `null` without a route.
// - `groups`: pace groups in `position` order, name + pace only (for
//   «25–35 км/ч · 2 группы»).
export const ROUTE_PREVIEW_MAX_POINTS = 40;
export interface PublicRideListItem extends PublicRide {
  registrationsCount: number;
  startLabel: string | null;
  routePreview: Array<[number, number]> | null;
  groups: Array<{ name: string; paceKmh: number }>;
}

export type ListPublicRidesResponse = Paginated<PublicRideListItem>;

// CR-025 ("Filters"): `bicycleType` is the one filter dimension this ticket ships —
// the only `Ride` field that's both always-set and a small closed enum
// (`.claude/context/current-task.md`). Distance/difficulty/price/date-range filters
// are deferred (no design-doc backing yet). `/mine` keeps the unextended
// `listRidesQuerySchema` — this filter is discovery-only.
// CR-026 ("Map discovery"), ADR-014: an optional map-viewport (bbox) filter — four
// named params, matching the existing style (`bicycleType`, `limit`, `cursor`) rather
// than one delimited string, still fully typed server-side. A partial bbox is
// meaningless, so all four must arrive together or not at all (the `.refine` below) —
// same "arrive together" pattern `updateRideRequestSchema`'s `startsAt`/
// `startTimezone` already uses.
const bboxFieldSchema = z.coerce.number();
export const listPublicRidesQuerySchema = listRidesQuerySchema
  .extend({
    bicycleType: z
      .enum(
        BICYCLE_TYPES,
        'bicycleType must be one of: road, gravel, mtb, any.',
      )
      .optional(),
    bboxNorth: bboxFieldSchema
      .min(-90, 'bboxNorth must be between -90 and 90.')
      .max(90, 'bboxNorth must be between -90 and 90.')
      .optional(),
    bboxSouth: bboxFieldSchema
      .min(-90, 'bboxSouth must be between -90 and 90.')
      .max(90, 'bboxSouth must be between -90 and 90.')
      .optional(),
    bboxEast: bboxFieldSchema
      .min(-180, 'bboxEast must be between -180 and 180.')
      .max(180, 'bboxEast must be between -180 and 180.')
      .optional(),
    bboxWest: bboxFieldSchema
      .min(-180, 'bboxWest must be between -180 and 180.')
      .max(180, 'bboxWest must be between -180 and 180.')
      .optional(),
  })
  .refine(
    (value) => {
      const provided = [
        value.bboxNorth,
        value.bboxSouth,
        value.bboxEast,
        value.bboxWest,
      ].filter((field) => field !== undefined).length;
      return provided === 0 || provided === 4;
    },
    {
      message:
        'bboxNorth, bboxSouth, bboxEast and bboxWest must all be provided together.',
      path: ['bboxNorth'],
    },
  );
export type ListPublicRidesQuery = z.infer<typeof listPublicRidesQuerySchema>;

// CR-018 ("Edit draft"): every field CR-017 deliberately left `null` at creation,
// still all independently optional (a future caller could send a sparse patch even
// though `EditRideForm` always submits the full current state,
// `.claude/context/current-task.md`). `coverImageUrl` stays out — deferred to the S3
// pipeline (KI-023), same call CR-017 made for creation. `startsAt`/`startTimezone`
// must arrive together or not at all — a lone new instant with the *old* zone (or
// vice versa) would silently reinterpret what the organizer meant.
export const updateRideRequestSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title cannot be empty.')
      .max(140, 'Title must be at most 140 characters.')
      .optional(),
    description: z
      .string()
      .trim()
      .max(2000, 'Description must be at most 2000 characters.')
      .nullable()
      .optional(),
    bicycleType: z
      .enum(
        BICYCLE_TYPES,
        'bicycleType must be one of: road, gravel, mtb, any.',
      )
      .optional(),
    startsAt: z.iso
      .datetime(
        'startsAt must be an ISO 8601 date-time (e.g. with a Z or offset).',
      )
      .optional(),
    startTimezone: z
      .string()
      .trim()
      .min(1, 'Start timezone is required.')
      .refine(
        isValidIanaTimeZone,
        'Start timezone must be a valid IANA time zone identifier.',
      )
      .optional(),
    // CR-026 ("Map discovery"), ADR-014: manual entry only — no geocode-by-address UI
    // yet (KI-016). Nullable/optional like every other field this ticket didn't
    // introduce; must arrive together or both be cleared together, same reasoning as
    // `startsAt`/`startTimezone` above (a lone coordinate is meaningless).
    startLat: z
      .number()
      .min(-90, 'startLat must be between -90 and 90.')
      .max(90, 'startLat must be between -90 and 90.')
      .nullable()
      .optional(),
    startLng: z
      .number()
      .min(-180, 'startLng must be between -180 and 180.')
      .max(180, 'startLng must be between -180 and 180.')
      .nullable()
      .optional(),
    participantLimit: z
      .number()
      .int()
      .min(1, 'Participant limit must be at least 1.')
      .nullable()
      .optional(),
    priceRub: z
      .number()
      .int()
      .min(0, 'Price must not be negative.')
      .nullable()
      .optional(),
    distanceKm: z
      .number()
      .min(0, 'Distance must not be negative.')
      .nullable()
      .optional(),
    elevationGainMeters: z
      .number()
      .int()
      .min(0, 'Elevation gain must not be negative.')
      .nullable()
      .optional(),
    paceKmh: z
      .number()
      .min(0, 'Pace must not be negative.')
      .nullable()
      .optional(),
    durationMinutes: z
      .number()
      .int()
      .min(0, 'Duration must not be negative.')
      .nullable()
      .optional(),
    // `DIFFICULTY_LEVELS` is the contiguous range 1-5 — `min`/`max` expresses the same
    // constraint as an explicit literal union, without the awkward zero-arg
    // `z.union` construction that array would otherwise need. Bounds are the literal
    // `1`/`5`, not `DIFFICULTY_LEVELS[0]`/`[...length - 1]` — a computed tuple index
    // widens to `number | undefined` under `noUncheckedIndexedAccess`.
    difficulty: z.number().int().min(1).max(5).nullable().optional(),
    // CR-125: not nullable — unlike the fields above, this setting always has a
    // value (default `true`), so there is no "clear it" state to express.
    participantsVisible: z.boolean().optional(),
  })
  .refine(
    (value) =>
      (value.startsAt === undefined) === (value.startTimezone === undefined),
    {
      message: 'startsAt and startTimezone must both be provided together.',
      path: ['startTimezone'],
    },
  )
  // CR-026: same "arrive together" rule as `startsAt`/`startTimezone` above — a lone
  // `startLat` without `startLng` (or vice versa) is meaningless. `undefined` means
  // "omit" (leave unchanged); a provided `null` is a deliberate clear and must be
  // paired with the other field's `null`, not left as `undefined`.
  .refine(
    (value) =>
      (value.startLat === undefined) === (value.startLng === undefined),
    {
      message: 'startLat and startLng must both be provided together.',
      path: ['startLng'],
    },
  );
export type UpdateRideRequest = z.infer<typeof updateRideRequestSchema>;

export interface UpdateRideResponse {
  ride: Ride;
}

// CR-019 ("Publish ride"): no request body — `draft -> published` is the only
// transition this endpoint performs, nothing to validate beyond the `:id` param
// already covered by `rideIdParamsSchema` in `apps/api`.
export interface PublishRideResponse {
  ride: Ride;
}

// CR-089 ("Open registration") / CR-020 ("Close registration"): same shape as
// `PublishRideResponse` — no request body, `:id` param only. Two distinct types (not
// one shared alias) so each stays free to diverge later without a rename, same
// convention as `CreateRideResponse`/`UpdateRideResponse` already being separate
// interfaces despite an identical shape today.
export interface OpenRegistrationResponse {
  ride: Ride;
}

export interface CloseRegistrationResponse {
  ride: Ride;
}

// CR-021 ("Cancel ride"): same shape as the other transition responses — no request
// body, `:id` param only. Unlike `publish`/`open-registration`/`close-registration`,
// this transition accepts three valid source statuses
// (`published`/`registration_open`/`registration_closed`), all resolved server-side
// against `docs/product.md`'s Lifecycle section — never a client-supplied status.
export interface CancelRideResponse {
  ride: Ride;
}

// CR-090 ("Start ride") / CR-022 ("Finish ride"): same shape as every other
// transition response — no request body, `:id` param only.
export interface StartRideResponse {
  ride: Ride;
}

export interface FinishRideResponse {
  ride: Ride;
}

// CR-028 ("Route rendering"), resolving KI-035: `GET /v1/rides/:id/route/geometry`'s
// response — the full ordered point array `GetRideResponse.route` (a summary only)
// deliberately omits.
export interface GetRouteGeometryResponse {
  points: RouteGeometryPoint[];
}

// CR-114 ("Route builder"): `POST /v1/rides/:id/route/build`. Ordered
// waypoints the organizer placed on the map; the API routes them along the
// map provider's road graph (bicycle) and stores the result as the ride's
// route, creating or replacing it. 25 is the per-request waypoint ceiling —
// enough for a detailed club ride, bounded so one call can't fan out into an
// arbitrarily large (billed) routing request.
export const ROUTE_BUILDER_MAX_POINTS = 25;

export const buildRouteRequestSchema = z.object({
  points: z
    .array(
      z.object({
        lat: z
          .number()
          .min(-90, 'lat must be between -90 and 90.')
          .max(90, 'lat must be between -90 and 90.'),
        lng: z
          .number()
          .min(-180, 'lng must be between -180 and 180.')
          .max(180, 'lng must be between -180 and 180.'),
      }),
    )
    .min(2, 'At least two points are required to build a route.')
    .max(
      ROUTE_BUILDER_MAX_POINTS,
      `At most ${ROUTE_BUILDER_MAX_POINTS} points are allowed.`,
    ),
});
export type BuildRouteRequest = z.infer<typeof buildRouteRequestSchema>;

// ADR-019/CR-086: `POST`/`PATCH /v1/rides/:id/cover`'s response. Deliberately
// minimal (not the whole `Ride`) — `coverImageUrl` is the only field either
// mutation changes; `GET /v1/rides/:id`'s embedded `ride.coverImageUrl` is the
// same value, same "return just the sub-resource" precedent as `RouteSummary`.
export interface CoverImageResponse {
  coverImageUrl: string;
}

// CR-030 ("Stops", `.claude/context/current-task.md`): `position` is never part of the
// request — server-assigned on create (appended at the end), immutable on `PATCH` (no
// reorder support in this ticket, no design-doc UI names one).
export const createStopRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name cannot be empty.')
    .max(140, 'Name must be at most 140 characters.'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be at most 500 characters.')
    .nullable()
    .optional(),
  lat: z
    .number()
    .min(-90, 'lat must be between -90 and 90.')
    .max(90, 'lat must be between -90 and 90.'),
  lng: z
    .number()
    .min(-180, 'lng must be between -180 and 180.')
    .max(180, 'lng must be between -180 and 180.'),
  durationMinutes: z
    .number()
    .int()
    .min(0, 'Duration must not be negative.')
    .nullable()
    .optional(),
});
export type CreateStopRequest = z.infer<typeof createStopRequestSchema>;

export interface CreateStopResponse {
  stop: Stop;
}

// CR-030: every field independently optional, same PATCH-semantics precedent as
// `updateRideRequestSchema`/`updateOrganizerProfile` — `position` is deliberately not
// here (see `createStopRequestSchema`'s comment).
export const updateStopRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name cannot be empty.')
    .max(140, 'Name must be at most 140 characters.')
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be at most 500 characters.')
    .nullable()
    .optional(),
  lat: z
    .number()
    .min(-90, 'lat must be between -90 and 90.')
    .max(90, 'lat must be between -90 and 90.')
    .optional(),
  lng: z
    .number()
    .min(-180, 'lng must be between -180 and 180.')
    .max(180, 'lng must be between -180 and 180.')
    .optional(),
  durationMinutes: z
    .number()
    .int()
    .min(0, 'Duration must not be negative.')
    .nullable()
    .optional(),
});
export type UpdateStopRequest = z.infer<typeof updateStopRequestSchema>;

export interface UpdateStopResponse {
  stop: Stop;
}

// CR-031 ("Route points", `.claude/context/current-task.md`): no `position` field,
// unlike `createStopRequestSchema` — a route point is a typed map pin, not an ordered
// itinerary entry.
export const createRoutePointRequestSchema = z.object({
  type: z.enum(
    ROUTE_POINT_TYPES,
    'type must be one of: start, finish, stop, danger, water, food, technical, other.',
  ),
  label: z
    .string()
    .trim()
    .min(1, 'Label cannot be empty.')
    .max(140, 'Label must be at most 140 characters.')
    .nullable()
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be at most 500 characters.')
    .nullable()
    .optional(),
  lat: z
    .number()
    .min(-90, 'lat must be between -90 and 90.')
    .max(90, 'lat must be between -90 and 90.'),
  lng: z
    .number()
    .min(-180, 'lng must be between -180 and 180.')
    .max(180, 'lng must be between -180 and 180.'),
});
export type CreateRoutePointRequest = z.infer<
  typeof createRoutePointRequestSchema
>;

export interface CreateRoutePointResponse {
  routePoint: RoutePoint;
}

// CR-031: every field independently optional, same PATCH-semantics precedent as
// `updateStopRequestSchema`.
export const updateRoutePointRequestSchema = z.object({
  type: z
    .enum(
      ROUTE_POINT_TYPES,
      'type must be one of: start, finish, stop, danger, water, food, technical, other.',
    )
    .optional(),
  label: z
    .string()
    .trim()
    .min(1, 'Label cannot be empty.')
    .max(140, 'Label must be at most 140 characters.')
    .nullable()
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be at most 500 characters.')
    .nullable()
    .optional(),
  lat: z
    .number()
    .min(-90, 'lat must be between -90 and 90.')
    .max(90, 'lat must be between -90 and 90.')
    .optional(),
  lng: z
    .number()
    .min(-180, 'lng must be between -180 and 180.')
    .max(180, 'lng must be between -180 and 180.')
    .optional(),
});
export type UpdateRoutePointRequest = z.infer<
  typeof updateRoutePointRequestSchema
>;

export interface UpdateRoutePointResponse {
  routePoint: RoutePoint;
}
