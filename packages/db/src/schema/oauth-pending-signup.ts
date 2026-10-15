import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// CR-269 (ADR-041): a Google/Yandex sign-in that would create a new account waits
// here until the person accepts the documents (`/register/consent`) — no user and
// no session exist before that. The browser holds only an opaque random token in an
// httpOnly cookie; this row stores its SHA-256, so the provider identity and the
// email never sit in a cookie (readable or not) and a copy of the table can't
// complete anyone's sign-up.
//
// Single use: completing deletes the row (`DELETE … RETURNING`) in the transaction
// that creates the account, so a replayed or concurrent completion finds nothing.
// One pending row per provider account (a second callback replaces the first and
// its token). Lives 10 minutes; expired rows are purged on the next insert.
export const oauthPendingSignups = pgTable(
  'oauth_pending_signups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull(),
    // `google` | `yandex` (`OAUTH_PROVIDERS` in apps/api).
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    // What the provider vouched for — verified, lowercased.
    email: text('email').notNull(),
    givenName: text('given_name'),
    familyName: text('family_name'),
    // The validated return target (`safeNextPath`).
    next: text('next'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('oauth_pending_signups_token_hash_unique').on(table.tokenHash),
    uniqueIndex('oauth_pending_signups_provider_account_unique').on(
      table.provider,
      table.providerAccountId,
    ),
    // The purge of expired rows.
    index('oauth_pending_signups_expires_at_idx').on(table.expiresAt),
    check(
      'oauth_pending_signups_provider_known',
      sql`${table.provider} in ('google', 'yandex')`,
    ),
  ],
);
