import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.js';

// CR-012 (`docs/decisions.md` ADR-013). One row per active login. `tokenHash`
// stores the SHA-256 hash of the opaque cookie token, never the token itself —
// same pattern as `email_verification_tokens.tokenHash` (CR-011): a database
// dump alone must not hand over a working session.
//
// `revokedAt` is part of ADR-013's fixed column list but unused by any CR-012
// code path — logout is a hard delete, not a soft-revoke (ADR-013 §1), and no
// admin "block" feature exists yet to set it. Kept because the schema is
// already-Accepted, not new scope.
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    // ADR-012: timestamptz, never bare timestamp.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // 30-day lifetime, rolling: extended at most once/day on use, not on every
    // request (ADR-013 §1) — see `apps/api/src/modules/auth/session.ts`.
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [uniqueIndex('sessions_token_hash_unique').on(table.tokenHash)],
);
