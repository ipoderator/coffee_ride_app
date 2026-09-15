import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { rides } from './ride.js';
import { users } from './user.js';

// Ninth domain table (CR-036, `.claude/rules/database.md`/`docs/database.md`).
//
// "WaitlistEntry — user waiting for a place" (`docs/database.md`). `waiting` is the
// only active state; `promoted` (converted into a real `Registration` when a spot
// frees up) and `cancelled` (the participant left the queue) are both terminal — kept
// as rows rather than deleted, same audit-trail discipline as
// `registrations.status`.
export const waitlistEntryStatusEnum = pgEnum('waitlist_entry_status', [
  'waiting',
  'promoted',
  'cancelled',
]);

export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`: a waitlist entry has no independent existence once its ride is gone,
    // same reasoning as `registrations.rideId`.
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: waitlistEntryStatusEnum('status').notNull().default('waiting'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    promotedAt: timestamp('promoted_at', { withTimezone: true }),
  },
  (table) => [
    // `.claude/rules/database.md`-style duplicate protection, same partial-unique
    // pattern as `registrations_ride_id_user_id_active_unique`: only one *waiting*
    // row per (ride, user) at a time — a participant can leave and rejoin the queue
    // (a fresh row), and a promoted/cancelled entry never blocks a new one.
    uniqueIndex('waitlist_entries_ride_id_user_id_waiting_unique')
      .on(table.rideId, table.userId)
      .where(sql`${table.status} = 'waiting'`),
    // Backs the FIFO promotion query (`ORDER BY created_at ASC WHERE ride_id = $1 AND
    // status = 'waiting'`) and the future CR-037 organizer waitlist view.
    index('waitlist_entries_ride_id_idx').on(table.rideId),
    index('waitlist_entries_user_id_idx').on(table.userId),
    check(
      'waitlist_entries_cancelled_at_consistent',
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} is not null)`,
    ),
    check(
      'waitlist_entries_promoted_at_consistent',
      sql`(${table.status} = 'promoted') = (${table.promotedAt} is not null)`,
    ),
  ],
);
