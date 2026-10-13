import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.js';

// CR-247 (ADR-034): an external sign-in linked to a user — today only Google, whose
// account id is the ID token's `sub` (stable, unlike the email). The unique pair is
// the real "one external account → one user" invariant; the sign-in transaction
// (`apps/api/src/modules/auth/google.service.ts`) inserts with ON CONFLICT DO NOTHING
// against it, so two racing callbacks for one Google account end with one row. No
// provider tokens are stored here or anywhere else.
export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // `google` only for now; a text column (not a pg enum) so a second provider is
    // a code change, not an `ALTER TYPE` migration.
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    // ADR-012: timestamptz, never bare timestamp.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('auth_identities_provider_account_unique').on(
      table.provider,
      table.providerAccountId,
    ),
    // The FK's `on delete cascade` looks rows up by user id.
    index('auth_identities_user_id_idx').on(table.userId),
  ],
);
