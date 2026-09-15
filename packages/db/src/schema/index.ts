// Drizzle schema root. Each domain entity gets its own file here
// (schema/user.ts, schema/ride.ts, ...) re-exported from this module, added
// via the `db-migration` skill at the point a real feature needs it. First
// content landed with CR-011 (`users`, `email_verification_tokens`).
//
// Conventions for when tables are added (`.claude/rules/database.md`,
// `docs/database.md`):
// - every timestamp column is `timestamptz` (ADR-012) — Drizzle's
//   `timestamp(..., { withTimezone: true })`, never bare `timestamp()`;
// - foreign keys for every real relationship; uniqueness/partial-unique
//   constraints where duplicates must be impossible; `NOT NULL`/check
//   constraints for required/bounded fields.
export * from './user.js';
export * from './email-verification-token.js';
export * from './session.js';
export * from './organizer-profile.js';
export * from './ride.js';
export * from './route.js';
