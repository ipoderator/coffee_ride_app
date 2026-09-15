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
  status: z.enum(RIDE_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
  updatedBy: z.string().nullable(),
});

// CR-023 ("Ride detail"): the ride's public organizer identity, embedded in `GET
// /v1/rides/:id`'s response instead of a separate public organizer-read endpoint
// (`.claude/context/current-task.md`).
export const rideOrganizerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
});

// CR-024 ("Ride list", public discovery): each item of `GET /v1/rides` carries the
// same organizer summary `GET /v1/rides/:id` already embeds — reuses both existing
// pieces, no new shape invented.
export const rideWithOrganizerResponseSchema = rideResponseSchema.extend({
  organizer: rideOrganizerSummarySchema,
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
