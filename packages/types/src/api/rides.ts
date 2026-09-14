import { z } from 'zod';
import { BICYCLE_TYPES, type Ride } from '../domain/ride.js';

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
