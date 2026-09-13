import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.js';

// CR-011 (`.claude/rules/database.md`). One row per issued verification token —
// a user can request a new one (e.g. after the first expired) without the old row
// disappearing, so history isn't lost; only the still-valid one matters for the
// `POST /v1/auth/verify-email` lookup.
//
// `tokenHash` stores the SHA-256 hash of the raw token, never the raw value itself —
// same pattern ADR-013 fixes for `Session.tokenHash`. The raw token exists only in
// the (dev-only, per this ticket's scope) API response and the link the user clicks.
export const emailVerificationTokens = pgTable(
  'email_verification_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    // 24h expiry (this ticket's plan). ADR-012: timestamptz, never bare timestamp.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // null = unused. Set once, at verification time; never cleared or reused
    // (single-use, per `.claude/rules/security.md`'s password-reset-token
    // discipline applied the same way here).
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('email_verification_tokens_token_hash_unique').on(
      table.tokenHash,
    ),
  ],
);
