import { z } from 'zod';
import { BICYCLE_TYPES, RIDE_STATUSES } from 'types';

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
