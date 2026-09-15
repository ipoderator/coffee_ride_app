import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { rides } from './ride.js';
import { users } from './user.js';

// Fifth domain table (CR-027, `.claude/rules/database.md`/`docs/database.md`).
//
// "Route — route geometry and metadata" (`docs/database.md`). One row per `Ride`
// (unique FK) holding the parsed GPX track: the raw file's S3 location, the ordered
// point geometry, and metrics computed from that geometry at upload time. Deliberately
// NOT the `RoutePoint` entity — `docs/database.md` defines `RoutePoint` as a small set
// of organizer-placed *typed* markers ("start/finish/stop/danger/water/food/
// technical/other", CR-031), not one row per raw GPX trackpoint. A long ride's track
// can have thousands of points, always read/written as one unit (the whole polyline,
// never queried per-point) — stored as a single `jsonb` array column here instead of a
// row-per-point table, per `.claude/context/current-task.md`'s investigation.
//
// `distanceKm`/`elevationGainMeters` here are independently computed from the actual
// GPX (haversine sum / positive-elevation-delta sum) — deliberately NOT synced into
// `rides.distanceKm`/`elevationGainMeters` (CR-018's organizer-entered manual fields).
// No named requirement says the GPX should override an organizer's own numbers;
// reconciling the two is left to a future ticket (`.claude/context/known-issues.md`).
export const routes = pgTable(
  'routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`, unlike `rides.organizer_id`'s `restrict`: a route has no independent
    // existence once its ride is gone (no endpoint deletes a `Ride` today either, but
    // if one ever exists, the route is exactly the kind of dependent data that should
    // go with it — unlike a whole ride disappearing as a side effect of a profile
    // delete, which CR-017's own comment already treats as real data loss).
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    // S3 object key (not a full URL — `apps/api/src/s3.ts`'s bucket/endpoint config
    // resolves it) and the organizer's original filename, kept for the download
    // response's `Content-Disposition`.
    gpxFileKey: text('gpx_file_key').notNull(),
    gpxFileName: text('gpx_file_name').notNull(),
    gpxFileSizeBytes: integer('gpx_file_size_bytes').notNull(),
    // `mode: 'number'`: same convention as `rides.distanceKm` — this codebase's
    // formatters take a plain `number`, well within `number`'s safe precision.
    distanceKm: numeric('distance_km', {
      precision: 6,
      scale: 1,
      mode: 'number',
    }).notNull(),
    elevationGainMeters: integer('elevation_gain_meters').notNull(),
    pointCount: integer('point_count').notNull(),
    // Ordered `{ lat, lng, elevationMeters }[]` — see the module comment above for why
    // this isn't a separate per-point table.
    geometry: jsonb('geometry').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `.claude/rules/security.md` audit trail, same pattern as `rides.updatedBy`.
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    // One route per ride — `PATCH`/`DELETE` operate on this row, `POST` 409s
    // (`route_already_exists`) if it's already present.
    uniqueIndex('routes_ride_id_unique').on(table.rideId),
    check('routes_distance_km_non_negative', sql`${table.distanceKm} >= 0`),
    check(
      'routes_elevation_gain_non_negative',
      sql`${table.elevationGainMeters} >= 0`,
    ),
    check('routes_point_count_positive', sql`${table.pointCount} >= 1`),
    check('routes_gpx_file_size_positive', sql`${table.gpxFileSizeBytes} > 0`),
  ],
);
