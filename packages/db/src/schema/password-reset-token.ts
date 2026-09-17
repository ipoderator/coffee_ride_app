import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.js';

// CR-060 (`.claude/rules/security.md`). Same shape as
// `email_verification_tokens` (CR-011): one row per issued reset request, a
// user can request more than one without an earlier row disappearing.
// `tokenHash` stores the SHA-256 hash of the raw token — the raw value is
// never persisted (same pattern as `Session.tokenHash`/
// `EmailVerificationToken.tokenHash`), and unlike CR-011's dev-only
// verification link, the raw token here is never returned over HTTP at all,
// in any environment (`.claude/context/current-task.md` — required to keep
// `POST /v1/auth/forgot-password`'s response identical whether or not the
// email exists).
export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    // 30 min expiry (top of security.md's 15–30 min range). ADR-012:
    // timestamptz, never bare timestamp.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    // null = unused. Set once a token is consumed by a successful reset, or
    // when a *different* still-outstanding token for the same user is
    // consumed (a successful reset invalidates every other pending token for
    // that user too — see `auth.service.ts`'s `resetPassword`).
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('password_reset_tokens_token_hash_unique').on(table.tokenHash),
  ],
);
