import { z } from 'zod';
import { BICYCLE_TYPES, type Ride } from '../domain/ride.js';
import type { Paginated } from './pagination.js';

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
  })
  .refine(
    (value) =>
      (value.startsAt === undefined) === (value.startTimezone === undefined),
    {
      message: 'startsAt and startTimezone must both be provided together.',
      path: ['startTimezone'],
    },
  );
export type UpdateRideRequest = z.infer<typeof updateRideRequestSchema>;

export interface UpdateRideResponse {
  ride: Ride;
}
