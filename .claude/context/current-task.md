# Current task — CR-250 — Account rate-limit Redis key leaks the email into logs

Source: owner, 2026-10-13 (pasted security finding, LOW). Branch `fix/account-rate-limit-key-hmac`.

## Goal

The per-account auth rate limit (CR-058) built its Redis key as
`auth-rl:account:<route>:<raw email>`, and on a Redis failure `isAccountRateLimited`
logged `{ err, key }` — so register/login/forgot-password emails reached the API log
(and Redis itself, and ioredis `ReplyError.command.args`).

## Requirements / acceptance

1. Key = `auth-rl:account:<route>:<HMAC-SHA256 base64url>` over the trimmed, lowercased
   identifier; HMAC key derived from `AUTH_SECRET` under its own label (same pattern as
   `google-transaction.ts`). Prefix kept (live-Redis test flushes `auth-rl:account:*`).
2. `logger.warn` on fail-open carries no key/identifier.
3. Unit tests: key has no email, is stable, case/space-insensitive, route- and
   secret-scoped; the warn payload holds no key.
4. lint, typecheck, api unit tests + auth.routes tests, coverage of touched files.

## Planned files

`apps/api/src/lib/account-rate-limit.ts` (+ test), `apps/api/src/modules/auth/auth.routes.ts`.

## Progress

- [x] implement - [x] tests - [x] validation - [x] close-task

## Validation results

- `pnpm test:coverage` in `apps/api` (live Redis/S3, `coffee_ride_test`): 55 files,
  767/767, 0 skipped; `pnpm coverage:check`: holds (`apps/api/src/lib/` +0.15 lines).
- `pnpm --filter api typecheck` clean; `lint` 0 errors (8 pre-existing warnings in
  `scripts/preflight.ts`); prettier clean on touched files.

## Discovered issues

- `notifications.service.ts:604/642/648` log the SMTP `err`; a provider rejection
  message can quote the recipient address. Not changed (out of scope).

## Final result

Done locally, all acceptance criteria met (tests in `account-rate-limit.test.ts`:
"CR-250: the fail-open warning carries no key", `accountRateLimitKeyFactory` block).
Committed; PR into `main`.
