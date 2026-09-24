import { z } from 'zod';
import { BICYCLE_TYPES, RIDE_STATUSES, ROUTE_POINT_TYPES } from 'types';

// The one "ride over the wire" shape (CLAUDE.md: no duplicate concepts). CR-017
// ("Create ride") only ever returns a row with `title`/`bicycleType`/`startsAt`/
// `startTimezone` set and everything else `null` — this schema still lists every
// column so the same shape works unchanged once CR-018 ("Edit draft") starts filling
// the rest in. Fastify's Zod serializer strips anything not listed here.
export const rideResponseSchema = z.object({
  id: z.string(),
  organizerId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  coverImageUrl: z.string().nullable(),
  bicycleType: z.enum(BICYCLE_TYPES),
  startsAt: z.string(),
  startTimezone: z.string(),
  startLat: z.number().nullable(),
  startLng: z.number().nullable(),
  participantLimit: z.number().nullable(),
  priceRub: z.number().nullable(),
  distanceKm: z.number().nullable(),
  elevationGainMeters: z.number().nullable(),
  paceKmh: z.number().nullable(),
  durationMinutes: z.number().nullable(),
  difficulty: z.number().nullable(),
  // CR-125: organizer-facing privacy toggle for `GET /v1/rides/:id/riders`.
  participantsVisible: z.boolean(),
  status: z.enum(RIDE_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});

// CR-023 ("Ride detail"): the ride's public organizer identity, embedded in `GET
// /v1/rides/:id`'s response instead of a separate public organizer-read endpoint
// (`.claude/context/current-task.md`).
// CR-043 ("Organizer rating summary"): additive `rating`/`reviewCount` — see
// `RideOrganizerSummary`'s own doc comment (`packages/types/src/api/rides.ts`).
export const rideOrganizerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  // CR-097 (KI-023 remainder): additive.
  avatarUrl: z.string().nullable(),
  rating: z.number().nullable(),
  reviewCount: z.number(),
});

// CR-024 ("Ride list", public discovery): each item of `GET /v1/rides` carries the
// same organizer summary `GET /v1/rides/:id` already embeds — reuses both existing
// pieces, no new shape invented.
export const rideWithOrganizerResponseSchema = rideResponseSchema.extend({
  organizer: rideOrganizerSummarySchema,
});

// CR-116 (discovery cards): `GET /v1/rides` items only — `PublicRideListItem`'s
// additive fields on top of the shared ride+organizer shape, which
// `GET /v1/registrations/mine` keeps using unchanged.
export const publicRideListItemResponseSchema =
  rideWithOrganizerResponseSchema.extend({
    registrationsCount: z.number(),
    startLabel: z.string().nullable(),
    routePreview: z.array(z.tuple([z.number(), z.number()])).nullable(),
    groups: z.array(z.object({ name: z.string(), paceKmh: z.number() })),
  });

// CR-117 ("Pace groups"): the one "group over the wire" shape, returned by
// `POST`/`PATCH .../groups`.
export const rideGroupResponseSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  name: z.string(),
  paceKmh: z.number(),
  description: z.string().nullable(),
  position: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});

// CR-117: `GET /v1/rides/:id`'s public `groups[]` items (`RideGroupSummary`).
export const rideGroupSummaryResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  paceKmh: z.number(),
  description: z.string().nullable(),
  position: z.number(),
  registrationsCount: z.number(),
});

// CR-117: the minimal group reference embedded in participant/rider lists.
export const rideGroupRefResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  paceKmh: z.number(),
});

// CR-027 ("GPX upload"): a route summary — no `geometry` array (see
// `.claude/context/current-task.md`'s "Full geometry exposure" scoping note).
export const routeSummaryResponseSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  gpxFileName: z.string(),
  gpxFileSizeBytes: z.number(),
  distanceKm: z.number(),
  elevationGainMeters: z.number(),
  pointCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// CR-028 ("Route rendering"), resolving KI-035: `GET /v1/rides/:id/route/geometry`'s
// response — the full ordered point array, separate from `routeSummaryResponseSchema`
// (which deliberately has no `geometry` field — see that schema's own comment).
export const routeGeometryResponseSchema = z.object({
  points: z.array(
    z.object({
      lat: z.number(),
      lng: z.number(),
      elevationMeters: z.number().nullable(),
    }),
  ),
});

// ADR-019/CR-086 ("Cover image"): `POST`/`PATCH /v1/rides/:id/cover`'s response —
// deliberately minimal, see `packages/types`' `CoverImageResponse` doc comment.
export const coverImageResponseSchema = z.object({
  coverImageUrl: z.string(),
});

// CR-030 ("Stops"): the one "stop over the wire" shape, embedded as an array in
// `GET /v1/rides/:id`'s response and returned by `POST`/`PATCH .../stops`.
export const stopResponseSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  durationMinutes: z.number().nullable(),
  position: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});

// CR-031 ("Route points"): the one "route point over the wire" shape, embedded as an
// array in `GET /v1/rides/:id`'s response and returned by `POST`/`PATCH
// .../route-points`. No `position` field, unlike `stopResponseSchema` — see
// `.claude/context/current-task.md`'s scope decision.
export const routePointResponseSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  type: z.enum(ROUTE_POINT_TYPES),
  label: z.string().nullable(),
  description: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});
