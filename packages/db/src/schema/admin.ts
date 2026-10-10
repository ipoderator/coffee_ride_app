import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.js';

// CR-228 (ADR-032). The platform-admin capability: a row here is what makes a `User`
// an admin — the same "a capability is an attached row, not a role enum" shape as
// `organizer_profiles` (ADR-006). Granted and revoked only from the host CLI
// (`packages/db/src/admin-cli.ts`), never over HTTP; `apps/api`'s `requireAdmin`
// reads this table on every request, so deleting the row revokes immediately.
export const platformAdmins = pgTable('platform_admins', {
  // `cascade`: the capability has no meaning without its user.
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  grantedAt: timestamp('granted_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adminActionTypeEnum = pgEnum('admin_action_type', [
  'admin_granted',
  'admin_revoked',
  'user_email_verified',
  'user_verification_resent',
  'user_sessions_revoked',
  'user_blocked',
  'user_unblocked',
  'ride_hidden',
  'ride_unhidden',
  'ride_cancelled',
  'review_hidden',
  'review_unhidden',
]);

export const adminTargetTypeEnum = pgEnum('admin_target_type', [
  'user',
  'ride',
  'review',
]);

// CR-228 (ADR-032, `.claude/rules/security.md` → "Audit trail"): one append-only row
// per admin action, written in the same transaction as the change it records. No
// endpoint updates or deletes a row. `payload` is deliberately absent — the row names
// the target by id and never copies participant data (email, phone) into the log.
export const adminActions = pgTable(
  'admin_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Null only for a grant/revoke run from the host CLI, which has no session user.
    // `set null`: the record of what happened outlives the admin's account.
    adminUserId: uuid('admin_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: adminActionTypeEnum('action').notNull(),
    targetType: adminTargetTypeEnum('target_type').notNull(),
    // No FK: the target is polymorphic, and the log must survive the target's
    // deletion.
    targetId: uuid('target_id').notNull(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // The journal screen's newest-first cursor list.
    index('admin_actions_created_at_id_idx').on(table.createdAt, table.id),
    // A user's/ride's own history on its admin card.
    index('admin_actions_target_idx').on(table.targetType, table.targetId),
    check(
      'admin_actions_reason_not_blank',
      sql`${table.reason} is null or length(btrim(${table.reason})) > 0`,
    ),
  ],
);
