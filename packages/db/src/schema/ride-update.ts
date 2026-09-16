import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { rides } from './ride.js';
import { users } from './user.js';

// Tenth domain table (CR-039, `.claude/rules/database.md`/`docs/database.md`).
//
// "RideUpdate — organizer message" (`docs/database.md`). One row per message an
// organizer sends about a ride (`docs/design.md` §8's "Ride updates composer",
// `/organizer/rides/[id]/updates`). Its only purpose is triggering a fan-out of
// `Notification` rows to that ride's active registrants
// (`.claude/context/current-task.md`) — there is no edit/delete, only create + list
// (no doc names either action).
export const rideUpdates = pgTable(
  'ride_updates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`: an update has no independent existence once its ride is gone, same
    // reasoning as `stops.rideId`/`routePoints.rideId`.
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    // Length bounded at the Zod layer only (1-2000 chars), same "no DB CHECK for
    // free text length" precedent as `rides.description`.
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `.claude/rules/security.md` audit trail, same pattern as `rides.updatedBy` —
    // `set null` so a since-deleted user's past updates don't disappear or become
    // unwritable, only their attribution goes blank.
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    // Backs the organizer's own update-history query (`createdAt desc`, ADR-011
    // cursor pagination).
    index('ride_updates_ride_id_idx').on(table.rideId),
  ],
);
