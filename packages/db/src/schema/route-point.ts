import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { rides } from './ride.js';
import { users } from './user.js';

// Seventh domain table (CR-031, `.claude/rules/database.md`/`docs/database.md`).
//
// "RoutePoint — start/finish/stop/danger/water/food/technical/other: a small set of
// organizer-placed *typed* markers along the route" (`docs/database.md`). Distinct
// from `Route.geometry` (raw GPX-derived polyline, one JSONB blob per ride) and from
// `Stop` (named planned rest points with duration, shown in route order). This value
// list must stay in sync with `packages/types/src/domain/route-point.ts`'s
// `ROUTE_POINT_TYPES` — duplicated for the same "each layer owns its own
// representation of one shared enum" reason `bicycleTypeEnum` duplicates
// `BICYCLE_TYPES` (`schema/ride.ts`'s own comment) — `packages/db` has no dependency
// on `packages/types`.
export const routePointTypeEnum = pgEnum('route_point_type', [
  'start',
  'finish',
  'stop',
  'danger',
  'water',
  'food',
  'technical',
  'other',
]);

// No `position`/uniqueness-per-type constraint — a route point is a typed map pin, not
// an ordered itinerary entry like `stops.position`, and a route can legitimately carry
// more than one marker of the same type (e.g. two `water` points) — see
// `.claude/context/current-task.md`'s scope decision.
export const routePoints = pgTable(
  'route_points',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`, same reasoning as `stops.rideId`: a route point has no independent
    // existence once its ride is gone.
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    type: routePointTypeEnum('type').notNull(),
    label: text('label'),
    description: text('description'),
    // Required, same reasoning as `stops.lat`/`stops.lng`: a marker's entire reason
    // for existing is a location.
    lat: numeric('lat', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    lng: numeric('lng', { precision: 9, scale: 6, mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `.claude/rules/security.md` audit trail, same pattern as `stops.updatedBy`.
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('route_points_ride_id_idx').on(table.rideId),
    check(
      'route_points_lat_range',
      sql`${table.lat} >= -90 and ${table.lat} <= 90`,
    ),
    check(
      'route_points_lng_range',
      sql`${table.lng} >= -180 and ${table.lng} <= 180`,
    ),
  ],
);
