// Fourth fixed domain type (CR-017, `.claude/CLAUDE.md`), first `Ride` ticket.
//
// `RIDE_STATUSES`/`RideStatus`, `BICYCLE_TYPES`/`BicycleType`, and
// `DIFFICULTY_LEVELS`/`DifficultyLevel` moved here from `packages/ui/src/
// terminology.ts` (CR-064 originally defined them there). `apps/api` needs these same
// enums for its Zod request validation and `packages/db`'s schema needs the same value
// lists for its Postgres enums, but `apps/api` must never depend on `packages/ui`
// (`.claude/rules/architecture.md`: "api -> db/types/maps-core", never "api -> ui").
// `packages/types` is the one package both `apps/api` and `packages/ui` may depend on,
// so it is now the single source of truth for these three enums;
// `packages/ui/src/terminology.ts` re-exports the types and keeps only the Russian
// label maps, which are genuinely UI-layer (`.claude/CLAUDE.md`: "do not create
// duplicate concepts under different names" — a second definition would otherwise
// have been needed for `apps/api`/`packages/db`).
export const RIDE_STATUSES = [
  'draft',
  'published',
  'registration_open',
  'registration_closed',
  'started',
  'finished',
  'cancelled',
] as const;
export type RideStatus = (typeof RIDE_STATUSES)[number];

export const BICYCLE_TYPES = ['road', 'gravel', 'mtb', 'any'] as const;
export type BicycleType = (typeof BICYCLE_TYPES)[number];

export const DIFFICULTY_LEVELS = [1, 2, 3, 4, 5] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

/**
 * A cycling event owned by an `OrganizerProfile` (`docs/database.md`). CR-017 ("Create
 * ride", see `.claude/context/current-task.md`) only ever creates a row with `title`/
 * `bicycleType`/`startsAt`/`startTimezone` set and every other field `null` — the rest
 * are filled in by CR-018 ("Edit draft"). Route/stops/services/requirements are
 * separate fixed domain entities (`Route`, `Stop`, `RideRequirement`, `RideService`)
 * with their own tickets, not fields on `Ride` itself.
 */
export interface Ride {
  id: string;
  organizerId: string;
  title: string;
  description: string | null;
  /** Deferred to the S3 pipeline (KI-023) — not implemented by any ticket yet. */
  coverImageUrl: string | null;
  bicycleType: BicycleType;
  /** Instant, `timestamptz` (ADR-012). */
  startsAt: string;
  /** IANA identifier for where the ride starts (ADR-012 §2) — required alongside
   * `startsAt` so "08:00" has an unambiguous meaning. */
  startTimezone: string;
  /** ADR-014 (CR-026, "Map discovery"): the ride's start point only — no `finish`
   * point yet (`.claude/context/known-issues.md`). Both `null` unless the organizer
   * has entered them manually (no geocode-by-address UI exists yet, KI-016). */
  startLat: number | null;
  startLng: number | null;
  participantLimit: number | null;
  priceRub: number | null;
  distanceKm: number | null;
  elevationGainMeters: number | null;
  paceKmh: number | null;
  durationMinutes: number | null;
  difficulty: DifficultyLevel | null;
  /** CR-125: organizer-facing privacy toggle for `GET /v1/rides/:id/riders` —
   * `false` hides the named participant list for every viewer (the ride's own
   * `registrationsCount` is unaffected). Defaults `true`. */
  participantsVisible: boolean;
  status: RideStatus;
  createdAt: string;
  updatedAt: string;
  /** `.claude/rules/security.md` audit trail — the user id that made the last change.
   * Set to the creator on insert; `null` only if that user is ever deleted (no such
   * endpoint exists today). */
  updatedBy: string | null;
}
