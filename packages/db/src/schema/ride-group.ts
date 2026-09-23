import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { rides } from './ride.js';
import { users } from './user.js';

// CR-117 ("Pace groups"), ADR-022 — a new domain entity, not a `Stop`/
// `RideRequirement` in disguise (see the ADR for why).
//
// "RideGroup — a pace group inside one ride" (`docs/database.md`): a group ride
// often splits by speed (e.g. 25 / 30 / 35 km/h), and a participant registers into
// exactly one of them. Capacity stays ride-level in this iteration (no per-group
// limit — `.claude/context/current-task.md`'s decision).
//
// `position` orders groups for display, dense `0..n-1` per ride — server-assigned on
// create (appended at the end), movable via `PATCH` (`ride-groups.service.ts`
// renumbers the rest). `ride_groups_ride_id_position_unique` is the DB-level backstop
// against two groups landing at the same slot under a race, same reasoning as
// `stops_ride_id_position_unique`. The max-6-groups-per-ride rule is enforced in the
// service under the ride row lock, not by a CHECK: a CHECK bounding `position` would
// leave no free slot for the two-phase renumbering a reorder needs (see
// `writeGroupPositions`).
export const rideGroups = pgTable(
  'ride_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`, same reasoning as `stops.rideId`: a group has no independent
    // existence once its ride is gone.
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Same precision as `rides.paceKmh` (one decimal, e.g. 27.5).
    paceKmh: numeric('pace_kmh', {
      precision: 4,
      scale: 1,
      mode: 'number',
    }).notNull(),
    description: text('description'),
    position: integer('position').notNull(),
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
    uniqueIndex('ride_groups_ride_id_position_unique').on(
      table.rideId,
      table.position,
    ),
    // Two groups called «Группа 1» and «группа 1» in one ride would be
    // indistinguishable to a participant choosing between them.
    uniqueIndex('ride_groups_ride_id_name_unique').on(
      table.rideId,
      sql`lower(${table.name})`,
    ),
    // Target of the composite FKs from `registrations`/`waitlist_entries`
    // `(group_id, ride_id)` — a plain FK on `group_id` alone could not guarantee
    // the chosen group belongs to the same ride as the registration.
    unique('ride_groups_id_ride_id_unique').on(table.id, table.rideId),
    // No separate `(ride_id)` index: `ride_groups_ride_id_position_unique` already
    // leads with `ride_id` and serves every per-ride lookup, in position order.
    check(
      'ride_groups_pace_kmh_range',
      sql`${table.paceKmh} >= 5 and ${table.paceKmh} <= 60`,
    ),
    check(
      'ride_groups_name_length',
      sql`char_length(${table.name}) between 1 and 60`,
    ),
    check('ride_groups_position_non_negative', sql`${table.position} >= 0`),
  ],
);
