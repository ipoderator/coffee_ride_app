# Current task

## Task ID

CR-060 — "Password reset flow (single-use, time-limited tokens, no account
enumeration)". Security foundations section, next unblocked ticket (CR-058 is
blocked on KI-014 — Redis unverified live in this environment).

## Goal

`.claude/rules/security.md`: "Password reset tokens are single-use and
time-limited (e.g. 15–30 min), invalidated after use/expiry. Requesting a
reset for a non-existent email returns the same response as for an existing
one (no account enumeration)." `docs/api.md` already names the two routes
(`POST /v1/auth/forgot-password`, `POST /v1/auth/reset-password`) with no
body — this ticket fills them in.

## Investigation

- Mirrors CR-011's email-verification-token shape almost exactly
  (`packages/db/src/schema/email-verification-token.ts`,
  `apps/api/src/modules/auth/tokens.ts`): opaque random token, only its
  SHA-256 hash persisted, single-use (`usedAt`), time-limited (`expiresAt`).
- Real tension with the enumeration rule: CR-011's `register` dev-only
  `verificationUrl` convenience (no email delivery yet, ADR-007 Pending)
  can't be reused for `forgot-password` — exposing the reset link only when
  the account exists (even gated to non-production) makes the response shape
  itself enumerable, which is exactly the property this rule protects.
  Decision: `POST /v1/auth/forgot-password` returns the same `204` in every
  environment, unconditionally — no dev-only token field, ever. The service
  function still returns the raw token to its caller (mirrors
  `registerUser`'s `verificationToken` return), but `auth.routes.ts` discards
  it. Tests obtain the token by importing the service function directly, the
  same way `.claude/rules/testing.md`-style behavior tests already reach past
  the HTTP layer when a deliberately-hidden value needs verifying.
- `.claude/rules/security.md` also requires: "a password change revokes every
  session of that user." ADR-013 logout is a hard delete (no soft
  `revokedAt` code path exists yet) — reset follows the same hard-delete
  shape: every `sessions` row for that `userId` is deleted in the same
  transaction as the password update.
- A user can accumulate more than one outstanding, unused, unexpired reset
  token (no previous-token invalidation on a repeat `forgot-password` call,
  same as CR-011's email-verification precedent). Left as-is on the
  `forgot-password` side (matches precedent), but closed on the `reset`
  side: a successful reset marks every other still-outstanding token for that
  user as used too, so a stale earlier link can't reset the password again
  after a newer one already succeeded.
- No web screen scope, by the same precedent CR-059/KI-026 already
  established for `/verify-email`: `docs/design.md` §Auth-flows names
  `/forgot-password`/`/reset-password` but no CR before this one built either
  the API or the screen. This ticket ships the API mechanics only; the screen
  gap gets its own known-issue entry, matching KI-026's shape.

## Decision

- New table `password_reset_tokens` (`packages/db`), same shape as
  `email_verification_tokens`: `id`, `userId` (FK cascade), `tokenHash`
  (unique), `expiresAt`, `usedAt` (nullable), `createdAt`.
- TTL: 30 minutes (top of security.md's 15–30 min range — reset links are
  emailed/manually shared, slightly more slack than a same-session action).
- `apps/api/src/modules/auth/auth.service.ts`: `requestPasswordReset(db,
email)` — always looks up the user, always returns quickly; if found,
  inserts a token and returns `{ userFound: true, resetToken }`; if not,
  returns `{ userFound: false }`. No password hashing involved, so no
  Argon2id-style timing-defense needed (unlike `loginUser`) — the sole
  requirement is an identical HTTP response either way, enforced at the route
  layer by never branching on the result.
- `resetPassword(db, token, newPassword)` — validates the token
  (unknown/used/expired → `AuthServiceError` `invalid_reset_token` /
  `reset_token_already_used` / `reset_token_expired`, 400 each), then in one
  transaction: updates `users.passwordHash`, marks the token `usedAt`, marks
  every other outstanding token for that user `usedAt` too, deletes every
  `sessions` row for that user. Returns the updated public `User`.
- Routes: `POST /v1/auth/forgot-password` (`204`, always, same
  `AUTH_RATE_LIMIT` tier) and `POST /v1/auth/reset-password` (`200 { user
}`, same rate-limit tier). Neither sets a session cookie — the user logs in
  again with the new password.
- `docs/api.md`/`docs/database.md` updated with the real contract/schema.
  `.claude/context/known-issues.md` gets a new entry for the missing web
  screens + the "never exposed via HTTP, even in dev" scope boundary.

## Requirements / acceptance criteria

- `forgot-password` response is byte-identical for an existing vs.
  non-existent email, in every `NODE_ENV`.
- A valid reset token successfully changes the password and can't be reused.
- An expired or already-used token is rejected with a distinct, correct code.
- On success, every existing session for that user is invalidated (a
  previously-valid session cookie 401s on `/v1/auth/me` afterward).
- A second, still-valid reset token for the same user is invalidated once one
  of them is used.
- Both endpoints are rate-limited at the same tier as register/login.
- `pnpm turbo run lint typecheck` and the full `apps/api`/`apps/web` test
  suites stay green.

## Planned files

- `packages/db/src/schema/password-reset-token.ts` (new), `schema/index.ts`.
- `packages/db/migrations/00XX_*.sql` (generated).
- `packages/types/src/api/auth.ts`.
- `apps/api/src/modules/auth/tokens.ts`, `auth.service.ts`, `auth.routes.ts`,
  `auth.routes.test.ts`.
- `docs/api.md`, `docs/database.md`, `docs/tasks.md`.
- `.claude/context/known-issues.md`, `.claude/context/project-state.md`,
  `docs/changelog.md`.

## Implementation progress

- [x] DB schema + migration (`0013_useful_living_tribunal.sql`, applied).
- [x] Shared Zod schemas.
- [x] Service layer (`requestPasswordReset`/`resetPassword`).
- [x] Routes + rate limiting.
- [x] Tests (happy path, enumeration-safety, expiry, reuse, session
      revocation, other-token invalidation, rate limit) — 36 new assertions.
- [x] Docs (`api.md`, `database.md`) + known-issues entry (KI-042).
- [x] Validation (lint/typecheck/test) + context updates.

## Validation results

`pnpm turbo run lint typecheck` — 17/17 tasks clean. `apps/api` full suite:
278/278 passing (was 265). `apps/web` full suite: 174/174 passing
(unaffected). `pnpm --filter api build` clean. Live-verified end to end
against this environment's real local Postgres + a running `apps/api`:
registered a real user; `forgot-password` returned byte-identical `204` for
that email and for a nonexistent one; obtained a real reset token via the
service layer directly (no HTTP path exposes it); captured a session cookie
by logging in with the old password; reset the password; confirmed the old
session cookie now 401s on `/v1/auth/me`; confirmed the new password logs in
and the old one is rejected. Dev server and scratch verification script
stopped/removed afterward.

## Discovered issues

None new — KI-042 documents the (expected, scoped-out) missing web
screens/email-delivery gap, same shape as KI-026.

## Final result

CR-060 is complete. `password_reset_tokens` table + `POST
/v1/auth/forgot-password`/`reset-password` ship the full single-use,
time-limited, enumeration-safe reset flow required by
`.claude/rules/security.md`, including session revocation and cross-token
invalidation on success. Security foundations now has one unblocked ticket
left: CR-061 (security headers, `@fastify/helmet`-equivalent) — CR-058 stays
blocked on KI-014 (Redis unverified live in this environment). Next logical
task: CR-061.
