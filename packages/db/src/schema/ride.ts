import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizerProfiles } from './organizer-profile.js';
import { users } from './user.js';

// Fourth domain table (CR-017, `.claude/rules/database.md`/`docs/database.md`). The
// first fixed domain entity `Ride` — owned by `OrganizerProfile`, not directly by
// `User` (`docs/database.md`: "Ride — cycling event owned by OrganizerProfile";
// ADR-006's older "ride.organizerId === session.userId" phrasing predates the
// `OrganizerProfile` decision — the FK below is the actual target, an ownership check
// resolves through the profile's own `userId`, still tracing only to the session).
//
// Scope decision (`.claude/context/current-task.md`): this is "Create ride" (CR-017),
// not "create and fully configure a ride" — `docs/design.md` §8 has a separate "Edit
// draft" screen (CR-018). Only the columns a valid draft needs at creation time are
// NOT NULL (`organizerId`, `title`, `bicycleType`, `startsAt`/`startTimezone`,
// `status`) — everything else is nullable, filled in later by CR-018. Route/stops/
// services/requirements are separate fixed domain entities (`Route`, `Stop`,
// `RideRequirement`, `RideService`) with their own tables/tickets, not columns here.
//
// The two enum value lists below must stay in sync with `packages/types/src/domain/
// ride.ts`'s `RIDE_STATUSES`/`BICYCLE_TYPES` — duplicated because `packages/db` has no
// dependency on `packages/types` (same "each layer owns its own representation of one
// shared enum" pattern as a Zod schema mirroring a DB constraint elsewhere in this
// codebase), not because they're a second, independently-evolving concept.
export const rideStatusEnum = pgEnum('ride_status', [
  'draft',
  'published',
  'registration_open',
  'registration_closed',
  'started',
  'finished',
  'cancelled',
]);

export const bicycleTypeEnum = pgEnum('bicycle_type', [
  'road',
  'gravel',
  'mtb',
  'any',
]);

export const rides = pgTable(
  'rides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `restrict`, not `cascade`: no endpoint deletes an `OrganizerProfile` today, but
    // if one is ever added, silently deleting every ride that profile owns as a side
    // effect would be real data loss (`.claude/rules/database.md`'s invariant-
    // protection principle) — the profile delete would have to handle its rides
    // explicitly instead.
    organizerId: uuid('organizer_id')
      .notNull()
      .references(() => organizerProfiles.id, { onDelete: 'restrict' }),
    title: text('title').notNull(),
    // Nullable — filled in via CR-018's edit screen (see the scope note above).
    description: text('description'),
    // CR-086/ADR-019: S3 object key (not a full URL — same convention as
    // `routes.gpxFileKey`), plus enough metadata to serve it without a second S3
    // round trip. Renamed from the original `cover_image_url` column (CR-017, never
    // actually populated) once ADR-019 decided images are served via an API proxy
    // (`GET /v1/rides/:id/cover`), not a stored direct URL.
    coverImageKey: text('cover_image_key'),
    coverImageContentType: text('cover_image_content_type'),
    coverImageSizeBytes: integer('cover_image_size_bytes'),
    bicycleType: bicycleTypeEnum('bicycle_type').notNull(),
    // ADR-012: the instant, plus the IANA zone of the ride's start (below) — neither
    // alone answers "what did the organizer mean by 08:00".
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    startTimezone: text('start_timezone').notNull(),
    // CR-026 ("Map discovery"), ADR-014: plain lat/lng, not a PostGIS geography
    // column — see the ADR for why. Only the start point — no named use case shows a
    // finish pin on the discovery map (`.claude/context/known-issues.md`). Nullable:
    // `.claude/rules/resilience.md`'s "ride can still be created/viewed without
    // geocoded coordinates" is the default path today, not a fallback for a failed
    // geocode call (no geocode-by-address UI exists yet, KI-016).
    startLat: numeric('start_lat', { precision: 9, scale: 6, mode: 'number' }),
    startLng: numeric('start_lng', { precision: 9, scale: 6, mode: 'number' }),
    participantLimit: integer('participant_limit'),
    priceRub: integer('price_rub'),
    // `mode: 'number'`: this codebase's `packages/ui` formatters
    // (`formatDistanceParts`, `formatSpeedParts`) take a plain `number`, and 1
    // decimal place is well within `number`'s safe precision — no reason to carry
    // Drizzle's default `numeric` string type through every consumer.
    distanceKm: numeric('distance_km', {
      precision: 6,
      scale: 1,
      mode: 'number',
    }),
    elevationGainMeters: integer('elevation_gain_meters'),
    paceKmh: numeric('pace_kmh', { precision: 4, scale: 1, mode: 'number' }),
    durationMinutes: integer('duration_minutes'),
    // 1-5, `DifficultyLevel` in `packages/types` — range enforced by the CHECK
    // constraint below, not a pg enum (an enum of five integers is unusual and
    // Drizzle's `pgEnum` is string-only).
    difficulty: integer('difficulty'),
    // CR-125: the organizer-facing privacy toggle for `GET /v1/rides/:id/riders`
    // (`.claude/context/current-task.md`). Defaults `true` so every existing row
    // keeps today's live behavior unchanged.
    participantsVisible: boolean('participants_visible')
      .notNull()
      .default(true),
    status: rideStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `.claude/rules/security.md` audit trail: "ride cancellation ... should be
    // attributable (who, when) at the database level from the start" — set to the
    // acting user's id on every insert/update, `updatedAt` already covers "when".
    // `set null`, not `cascade`/`restrict`: if the referencing user is ever deleted
    // (no such endpoint exists today), the ride row itself must not disappear or
    // become unwritable — only its attribution goes blank.
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    // Every nullable numeric field's lower bound, plus difficulty's 1-5 range —
    // `.claude/rules/database.md`: "important invariants should be enforced at the
    // database level where practical", not just by `packages/types`' Zod schema
    // (CR-018 fills these in later, so they can't be enforced by this ticket's own
    // request schema, which doesn't accept them at all yet).
    check(
      'rides_participant_limit_positive',
      sql`${table.participantLimit} is null or ${table.participantLimit} >= 1`,
    ),
    check(
      'rides_price_rub_non_negative',
      sql`${table.priceRub} is null or ${table.priceRub} >= 0`,
    ),
    check(
      'rides_distance_km_non_negative',
      sql`${table.distanceKm} is null or ${table.distanceKm} >= 0`,
    ),
    check(
      'rides_elevation_gain_non_negative',
      sql`${table.elevationGainMeters} is null or ${table.elevationGainMeters} >= 0`,
    ),
    check(
      'rides_pace_kmh_non_negative',
      sql`${table.paceKmh} is null or ${table.paceKmh} >= 0`,
    ),
    check(
      'rides_duration_minutes_non_negative',
      sql`${table.durationMinutes} is null or ${table.durationMinutes} >= 0`,
    ),
    check(
      'rides_cover_image_size_bytes_non_negative',
      sql`${table.coverImageSizeBytes} is null or ${table.coverImageSizeBytes} >= 0`,
    ),
    check(
      'rides_difficulty_range',
      sql`${table.difficulty} is null or (${table.difficulty} >= 1 and ${table.difficulty} <= 5)`,
    ),
    // ADR-014: latitude/longitude range invariants enforced at the DB level, not
    // just by `packages/types`' Zod schema.
    check(
      'rides_start_lat_range',
      sql`${table.startLat} is null or (${table.startLat} >= -90 and ${table.startLat} <= 90)`,
    ),
    check(
      'rides_start_lng_range',
      sql`${table.startLng} is null or (${table.startLng} >= -180 and ${table.startLng} <= 180)`,
    ),
    // ADR-014: the composite B-tree backing `GET /v1/rides`'s bbox filter
    // (`rides.service.ts`'s `listPublicRides`) — the plain-range-query half of the
    // decision, not a spatial (GiST) index.
    index('rides_start_lat_lng_idx').on(table.startLat, table.startLng),
  ],
);
