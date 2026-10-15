import { sql } from 'drizzle-orm';
import {
  check,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './user.js';

// CR-269 (ADR-041): the proof that a person accepted a legal document — which
// document, which immutable version and the SHA-256 of that version's text
// (`packages/types`' `LEGAL_DOCUMENTS`), when, and through which flow. Written in
// the same transaction that creates the account (password register, first Google/
// Yandex sign-in) or by a signed-in re-consent. Deliberately minimal: no IP, no
// User-Agent — nothing the proof doesn't need (152-ФЗ, ст. 5: minimal data).
//
// UNIQUE(user, document, version) makes accepting idempotent: a repeat (double
// submit, two tabs) inserts with ON CONFLICT DO NOTHING and keeps the first
// `accepted_at`. Rows go with the account (`on delete cascade`): once the account
// is deleted there is no processing left to justify.
export const legalAcceptances = pgTable(
  'legal_acceptances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // `terms` | `personal_data_consent` (`CONSENT_DOCUMENT_TYPES`).
    document: text('document').notNull(),
    version: text('version').notNull(),
    contentSha256: text('content_sha256').notNull(),
    // `register_password` | `oauth_google` | `oauth_yandex` | `reconsent`.
    source: text('source').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Also the lookup index: every read is "this user's acceptances".
    uniqueIndex('legal_acceptances_user_document_version_unique').on(
      table.userId,
      table.document,
      table.version,
    ),
    check(
      'legal_acceptances_document_known',
      sql`${table.document} in ('terms', 'personal_data_consent')`,
    ),
    check(
      'legal_acceptances_source_known',
      sql`${table.source} in ('register_password', 'oauth_google', 'oauth_yandex', 'reconsent')`,
    ),
    check(
      'legal_acceptances_sha256_hex',
      sql`${table.contentSha256} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'legal_acceptances_version_not_blank',
      sql`length(btrim(${table.version})) > 0`,
    ),
  ],
);
