import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { rides } from './ride.js';
import { users } from './user.js';

// Sixth domain table (CR-030, `.claude/rules/database.md`/`docs/database.md`).
//
// "Stop — named planned stop with location and duration" (`docs/database.md`).
// Distinct from `Route` (the raw GPX-derived polyline, one JSONB blob per ride) and
// from the not-yet-built `RoutePoint` (CR-031: a small set of organizer-placed
// *typed* markers — start/finish/stop/danger/water/food/technical/other). `Stop` is
// its own simpler entity: a handful of named, organizer-curated rest points per ride,
// each an individually addressable row (unlike `Route.geometry`, which is always
// read/written as one unit).
//
// `position` orders stops along the route for display. Server-assigned on create
// (current count for the ride, i.e. appended at the end — `rides.service.ts`'s
// `createStop`) — no reorder/drag support in this ticket (no design-doc UI names one),
// so `position` is never part of the `PATCH` request. Enforced unique per `(rideId,
// position)` at the DB level (`.claude/rules/database.md`: invariants belong at the DB
// level, not just app code) — protects against two stops silently landing at the same
// position under a request race, the same way `routes_ride_id_unique` protects
// "one route per ride".
export const stops = pgTable(
  'stops',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`, same reasoning as `routes.rideId`: a stop has no independent
    // existence once its ride is gone.
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    // Required, unlike `rides.startLat/startLng` (nullable — a ride is meaningful
    // without geocoded coordinates yet). A stop's entire reason for existing is a
    // location, so an organizer creating one always supplies it.
    lat: numeric('lat', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    lng: numeric('lng', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    durationMinutes: integer('duration_minutes'),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `.claude/rules/security.md` audit trail, same pattern as `rides.updatedBy`/
    // `routes.updatedBy`.
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    uniqueIndex('stops_ride_id_position_unique').on(
      table.rideId,
      table.position,
    ),
    index('stops_ride_id_idx').on(table.rideId),
    check('stops_lat_range', sql`${table.lat} >= -90 and ${table.lat} <= 90`),
    check('stops_lng_range', sql`${table.lng} >= -180 and ${table.lng} <= 180`),
    check(
      'stops_duration_minutes_non_negative',
      sql`${table.durationMinutes} is null or ${table.durationMinutes} >= 0`,
    ),
    check('stops_position_non_negative', sql`${table.position} >= 0`),
  ],
);
