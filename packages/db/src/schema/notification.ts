import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { rideUpdates } from './ride-update.js';
import { rides } from './ride.js';
import { users } from './user.js';

// Eleventh domain table (CR-038/039/040/041,
// `.claude/rules/database.md`/`docs/database.md`).
//
// "Notification — delivery record" (`docs/database.md`). One row per in-app
// notification delivered to one user (ADR-007, Pending: "Start with in-app
// notifications; external provider later behind an adapter" — this table IS that
// starting point, no email/push here). `type` maps 1:1 to the three producer
// tickets (`.claude/context/current-task.md`'s scope decision): `registration_
// confirmed` (CR-038, also reused for a waitlist promotion), `ride_update`
// (CR-039), `ride_cancelled` (CR-040 — the organizer cancelling the whole ride,
// distinct from a participant cancelling their own registration, which needs no
// notification).
export const notificationTypeEnum = pgEnum('notification_type', [
  'registration_confirmed',
  'ride_update',
  'ride_cancelled',
]);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`: a notification has no independent existence once its recipient is
    // gone, same reasoning as `registrations.userId`.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // `cascade`: same reasoning — no notification outlives the ride it's about.
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    // Only set for `type = 'ride_update'` — the specific message being fanned out.
    // `cascade`: a notification pointing at a since-deleted update is meaningless
    // (no endpoint deletes a `RideUpdate` today, but the FK is still correct).
    rideUpdateId: uuid('ride_update_id').references(() => rideUpdates.id, {
      onDelete: 'cascade',
    }),
    type: notificationTypeEnum('type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `null` means unread — set once via `POST /v1/notifications/:id/read`
    // (`.claude/context/current-task.md`: per-notification, no bulk "mark all
    // read" in this ticket).
    readAt: timestamp('read_at', { withTimezone: true }),
  },
  (table) => [
    // Backs the per-user inbox query (`createdAt desc`, ADR-011 cursor pagination).
    index('notifications_user_id_idx').on(table.userId),
    index('notifications_ride_id_idx').on(table.rideId),
    check(
      'notifications_ride_update_id_consistent',
      sql`(${table.type} = 'ride_update') = (${table.rideUpdateId} is not null)`,
    ),
  ],
);
