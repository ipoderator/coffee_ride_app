import { sql } from 'drizzle-orm';
import {
  check,
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
    // Deferred to the S3 pipeline, same KI-023 gap `OrganizerProfile`/`User` already
    // carry — not a new one.
    coverImageUrl: text('cover_image_url'),
    bicycleType: bicycleTypeEnum('bicycle_type').notNull(),
    // ADR-012: the instant, plus the IANA zone of the ride's start (below) — neither
    // alone answers "what did the organizer mean by 08:00".
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    startTimezone: text('start_timezone').notNull(),
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
      'rides_difficulty_range',
      sql`${table.difficulty} is null or (${table.difficulty} >= 1 and ${table.difficulty} <= 5)`,
    ),
  ],
);
