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
import { users } from './user.js';

// Twelfth domain table (CR-042, `.claude/rules/database.md`/`docs/database.md`).
//
// "Review — participant feedback on a finished ride" (`docs/database.md`). No
// edit/delete, only create + list (`.claude/context/current-task.md`) — same
// immutable-message precedent as `ride_updates`. Eligibility (active registration on
// a `finished` ride) is a service-layer check
// (`apps/api/src/modules/reviews/reviews.service.ts`), not a DB constraint — this
// table has no FK to `registrations` because a later registration cancellation must
// never retroactively invalidate an already-submitted review.
export const reviews = pgTable(
  'reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`: a review has no independent existence once its ride is gone, same
    // reasoning as `stops.rideId`/`ride_updates.rideId`.
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    // `cascade`: same reasoning as `registrations.userId` — no endpoint deletes a
    // `User` today, but a dangling review for a deleted user would be meaningless.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    rating: integer('rating').notNull(),
    // Length bounded at the Zod layer only, same "no DB CHECK for free text length"
    // precedent as `ride_updates.message`.
    comment: text('comment'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // `.claude/rules/database.md`: one review per (ride, user) — enforced at the DB
    // level, not just by `reviews.service.ts`'s check. Not partial (unlike
    // `registrations`' active-only unique index): a review has no `status`/cancel
    // concept, so a plain unique index on every row is correct. Its `rideId`-leading
    // shape also backs the `GET /v1/rides/:id/reviews` list query and the organizer
    // rating join, so no separate `rideId` index is needed.
    uniqueIndex('reviews_ride_id_user_id_unique').on(
      table.rideId,
      table.userId,
    ),
    check('reviews_rating_range', sql`${table.rating} between 1 and 5`),
  ],
);
