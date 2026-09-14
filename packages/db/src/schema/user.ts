import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

// First domain table (CR-011, `.claude/rules/database.md`/`docs/database.md`).
//
// `email` is stored already-lowercased by the service layer (`apps/api/src/modules/
// auth/auth.service.ts`) — the unique index below is a plain btree on the stored value,
// not a case-insensitive one (no `citext` extension dependency for a single column).
//
// No `updatedBy` column: `.claude/rules/security.md`'s audit-trail requirement is for
// *sensitive state changes made by someone else* (organizer actions, admin actions) —
// this row is created by the user themself via self-registration, so `createdAt` alone
// already answers "who and when".
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    // Required before a User can act as an organizer or take another
    // trust-sensitive action (`docs/auth.md`) — enforced by future tickets that check
    // this column (starting with organizer-profile creation, CR-014). Defaults false;
    // flipped by `POST /v1/auth/verify-email`.
    emailVerified: boolean('email_verified').notNull().default(false),
    // Profile fields (CR-013). All nullable — a user can leave any/all unset;
    // there is no NOT NULL default that would make sense for a human's name/phone/bio.
    // `displayName`/`bio` length limits and `phone`'s format are enforced by
    // `packages/types`' `updateProfileRequestSchema` at the API boundary, not by a
    // DB CHECK constraint — same tier of "required-shaped-but-not-DB-invariant" data
    // as nothing else on this table yet.
    displayName: text('display_name'),
    // Private contact data (`.claude/rules/security.md`) — returned only to the
    // profile's own owner (`GET /v1/auth/me`, `PATCH /v1/users/me`), never to another
    // user; no other endpoint exposes another user's row today, so there is nothing
    // else to restrict yet, but this is the constraint to preserve once one does.
    phone: text('phone'),
    bio: text('bio'),
    // ADR-012: every timestamp column is `timestamptz`, never bare `timestamp`.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
);
