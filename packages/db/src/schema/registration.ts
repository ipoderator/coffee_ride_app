import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { rides } from './ride.js';
import { rideGroups } from './ride-group.js';
import { users } from './user.js';

// Eighth domain table (CR-032, `.claude/rules/database.md`/`docs/database.md`).
//
// "Registration — User ↔ Ride" (`docs/database.md`). `status` keeps a cancelled
// registration as a row (audit trail, `.claude/rules/security.md`) rather than
// deleting it, and lets a participant re-register after cancelling — a fresh row, not
// resurrecting the old one.
export const registrationStatusEnum = pgEnum('registration_status', [
  'active',
  'cancelled',
]);

export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`: a registration has no independent existence once its ride is gone,
    // same reasoning as `stops.rideId`/`routePoints.rideId`.
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    // `cascade`: same reasoning — no endpoint deletes a `User` today, but if one ever
    // exists, a dangling registration for a deleted user is meaningless.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: registrationStatusEnum('status').notNull().default('active'),
    // CR-117 ("Pace groups", ADR-022): the pace group the participant rides with.
    // Nullable — a ride without groups has none, and a registration made before the
    // organizer added groups keeps `null` until the participant picks one. Its FK is
    // the composite `registrations_group_ride_fk` below, not a plain `.references()`.
    groupId: uuid('group_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  },
  (table) => [
    // `.claude/rules/database.md`: "active duplicate registration is forbidden" —
    // enforced at the DB level, not just by `registrations.service.ts`'s row-locked
    // check. A partial unique index (not a plain unique constraint on
    // `(rideId, userId)`) so a participant can cancel and later re-register: only one
    // *active* row per (ride, user) at a time, any number of cancelled ones.
    uniqueIndex('registrations_ride_id_user_id_active_unique')
      .on(table.rideId, table.userId)
      .where(sql`${table.status} = 'active'`),
    // Backs `registrations.service.ts`'s active-count-per-ride query (capacity check,
    // `GetRideResponse.registrationsCount`) and the future CR-037 participant list.
    index('registrations_ride_id_idx').on(table.rideId),
    // Backs the future CR-091 ("My registrations") per-user lookup.
    index('registrations_user_id_idx').on(table.userId),
    // CR-117: `(group_id, ride_id)` → `ride_groups(id, ride_id)`, so a registration
    // can only ever point at a group of its *own* ride — enforced by the DB, not just
    // `registrations.service.ts`'s lookup. `MATCH SIMPLE` (Postgres default): a `null`
    // `group_id` skips the check entirely. `no action` rather than `restrict`: both
    // block deleting a group that is still referenced, but `no action` is checked at
    // end of statement, so deleting a whole ride (which cascades to *both*
    // `ride_groups` and `registrations`) still works regardless of cascade order.
    // `ride-groups.service.ts`'s `deleteRideGroup` 409s `group_has_registrations`
    // before this backstop is ever reached for an active registration.
    foreignKey({
      name: 'registrations_group_ride_fk',
      columns: [table.groupId, table.rideId],
      foreignColumns: [rideGroups.id, rideGroups.rideId],
    }).onDelete('no action'),
    // Backs the per-group active-count query (`GET /v1/rides/:id`'s
    // `groups[].registrationsCount`) and the delete-group reference check.
    index('registrations_group_id_idx').on(table.groupId),
    check(
      'registrations_cancelled_at_consistent',
      sql`(${table.status} = 'cancelled') = (${table.cancelledAt} is not null)`,
    ),
  ],
);
