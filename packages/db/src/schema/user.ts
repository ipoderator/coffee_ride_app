import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// CR-126: who besides the owner can view a rider-profile card
// (`GET /v1/rides/:id/riders/:registrationId/profile`) — see
// `apps/api/src/modules/registrations/registrations.service.ts`'s
// `resolveRiderAccess`. Never controls `phone`/`email` (never returned to anyone but
// the owner, regardless of this setting) — only the social-profile fields below.
export const profileVisibilityEnum = pgEnum('profile_visibility', [
  'closed',
  'co_participants',
  'open',
]);

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
    // CR-125: shown in the ride riders/participants/waitlist lists in preference
    // to `displayName` (a free-text nickname) when either is set — see
    // `apps/api/src/modules/registrations/registrations.service.ts`'s
    // `resolveParticipantName`. Nullable for the same reason as `displayName`.
    firstName: text('first_name'),
    lastName: text('last_name'),
    // Private contact data (`.claude/rules/security.md`) — returned only to the
    // profile's own owner (`GET /v1/auth/me`, `PATCH /v1/users/me`), never to another
    // user; no other endpoint exposes another user's row today, so there is nothing
    // else to restrict yet, but this is the constraint to preserve once one does.
    phone: text('phone'),
    bio: text('bio'),
    // CR-097 (KI-023 remainder, ADR-019's reuse point 7): same S3-key-plus-
    // metadata shape as `rides.cover_image_*`, stored/served through the
    // relocated `lib/image-processing.ts`/`lib/image-storage.ts` pair rather
    // than a new pipeline.
    avatarKey: text('avatar_key'),
    avatarContentType: text('avatar_content_type'),
    avatarSizeBytes: integer('avatar_size_bytes'),
    // CR-126: gates the rider-profile card (bio, avatar, bikes, distance stats,
    // recent rides) — see `profileVisibilityEnum` above. Defaults `co_participants`:
    // visible to people the user actually shares a ride with, not the whole platform,
    // without shipping the feature switched off for everyone.
    profileVisibility: profileVisibilityEnum('profile_visibility')
      .notNull()
      .default('co_participants'),
    // CR-126: self-reported distance stats shown on the rider-profile card
    // (`docs/product.md` confirmed: manually entered, not derived from ride history).
    // Nullable — missing renders `—` per `docs/design.md` §7, never `0`. Bounds are
    // generous sanity caps against garbage input, not real-world limits.
    distanceWeekKm: integer('distance_week_km'),
    distanceMonthKm: integer('distance_month_km'),
    distanceYearKm: integer('distance_year_km'),
    // ADR-012: every timestamp column is `timestamptz`, never bare `timestamp`.
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('users_email_unique').on(table.email),
    check(
      'users_avatar_size_bytes_non_negative',
      sql`${table.avatarSizeBytes} is null or ${table.avatarSizeBytes} >= 0`,
    ),
    check(
      'users_distance_week_km_range',
      sql`${table.distanceWeekKm} is null or (${table.distanceWeekKm} >= 0 and ${table.distanceWeekKm} <= 3000)`,
    ),
    check(
      'users_distance_month_km_range',
      sql`${table.distanceMonthKm} is null or (${table.distanceMonthKm} >= 0 and ${table.distanceMonthKm} <= 10000)`,
    ),
    check(
      'users_distance_year_km_range',
      sql`${table.distanceYearKm} is null or (${table.distanceYearKm} >= 0 and ${table.distanceYearKm} <= 100000)`,
    ),
  ],
);
