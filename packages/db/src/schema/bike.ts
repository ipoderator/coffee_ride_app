import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { bicycleTypeEnum } from './ride.js';
import { users } from './user.js';

// CR-126 ("garage"): the bikes a participant lists on their profile. Reuses
// `bicycleTypeEnum` from `ride.ts` (same domain concept as a ride's bicycle type) —
// `'any'` is accepted by the column type but rejected at the `packages/types` Zod
// boundary for a bike, since "any" doesn't describe a single physical bike.
export const userBikes = pgTable(
  'user_bikes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // `cascade`: a bike has no independent existence once its owner is gone, same
    // reasoning as `registrations.userId`.
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    bikeType: bicycleTypeEnum('bike_type').notNull(),
    brand: text('brand'),
    model: text('model'),
    // Exactly one active bike per user, enforced by the partial unique index below —
    // not just by `users.service.ts`'s transaction that unsets the previous one.
    isActive: boolean('is_active').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('user_bikes_one_active_per_user')
      .on(table.userId)
      .where(sql`${table.isActive}`),
    // Backs `GET /v1/users/me/bikes` and the rider-profile card's bike list.
    index('user_bikes_user_id_idx').on(table.userId),
  ],
);
