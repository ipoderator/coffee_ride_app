import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { rides } from './ride.js';

// CR-155: `RideRequirement` (`.claude/CLAUDE.md` domain entities) — one line of the
// ride page's «Требования» list («Шлем обязателен», «С собой: вода, камера»).
// Free text rather than typed fields: organizers phrase helmet/bike/experience/
// what-to-bring rules in their own words, and the page only lists them.
//
// Always written as a whole list (`PATCH /v1/rides/:id`'s `requirements`, which
// deletes and re-inserts inside the ride update's transaction), so `position` is
// dense `0..n-1`; `ride_requirements_ride_id_position_unique` is the backstop and
// also serves the per-ride read in position order. The max-10-per-ride rule lives
// in the request schema — the whole list arrives in one request.
export const rideRequirements = pgTable(
  'ride_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    text: text('text').notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('ride_requirements_ride_id_position_unique').on(
      table.rideId,
      table.position,
    ),
    check(
      'ride_requirements_text_length',
      sql`char_length(${table.text}) between 1 and 120`,
    ),
    check(
      'ride_requirements_position_non_negative',
      sql`${table.position} >= 0`,
    ),
  ],
);
