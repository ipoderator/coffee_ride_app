import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.js';

// Third domain table (CR-014, `.claude/rules/database.md`/`docs/database.md`).
//
// "Public organizer data linked to User" (`docs/database.md`) — the second fixed
// domain entity from `.claude/CLAUDE.md`. One row per `User` that has opted into
// organizer capabilities (ADR-006: "An `OrganizerProfile` attached to a `User` grants
// organizer capabilities for resources that `User` owns"), enforced here with a real
// unique index, not just application logic — a second `POST /v1/organizers/me` for the
// same user must fail at the database, not merely be discouraged by the route.
//
// `name` is deliberately separate from `users.displayName` (CR-013): `docs/product.md`
// confirms private individuals, clubs, bike shops and teams all share this one path
// with no distinct account type, so the organizer's public identity (e.g. a club name)
// is not assumed to equal the person's own display name.
//
// No `updatedBy` column, same reasoning as `users.ts`: this row is created/edited only
// by its own owner (never another user or an admin on their behalf, today), so
// `createdAt`/`updatedAt` alone already answer "who and when"
// (`.claude/rules/security.md`'s audit-trail requirement is for changes made by
// someone *other than* the row's owner).
export const organizerProfiles = pgTable(
  'organizer_profiles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Nullable: "about the organizer" is optional, same tier as `users.bio`.
    // Length (≤500 chars) is enforced by `packages/types`' Zod schema at the API
    // boundary, not a DB CHECK constraint — same convention as `users.ts`.
    description: text('description'),
    // ADR-012: every timestamp column is `timestamptz`, never bare `timestamp`.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('organizer_profiles_user_id_unique').on(table.userId),
  ],
);
