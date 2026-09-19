# Current task

## Task ID

CR-058 — Redis-backed, per-IP-and-per-account auth rate limiting (resolves
KI-022). Closed.

## Goal

`.claude/rules/security.md`: "Rate-limit `/v1/auth/login`, `/v1/auth/register`,
`/v1/auth/forgot-password`, per IP and per account, more aggressively than
general API rate limits." CR-011 shipped an interim in-memory, per-IP-only
tier. Blocked on KI-014 since CR-011; this session found Docker up and a
live Redis already healthy (from a prior session), so it was picked up
instead of waiting further.

## Requirements / acceptance criteria — all met

- Per-IP tier Redis-backed when `REDIS_URL` configured, in-memory fallback
  otherwise. Done (`app.ts`).
- Independent per-account tier on register/login/forgot-password only. Done
  (`lib/account-rate-limit.ts`).
- Both tiers fail OPEN on a Redis error/timeout — live-verified, not just
  reasoned about (stopped the real `redis` container mid-session, confirmed
  `POST /v1/auth/login` still replied `401` in ~1.3s).
- No behavior change with `REDIS_URL` unset — all pre-existing tests pass
  unmodified.

## Implementation

- `apps/api/src/app.ts`: global `rateLimit` registration gains
  `redis: app.redis` (when configured) + `skipOnError: true`.
- `apps/api/src/lib/account-rate-limit.ts` (new): atomic `MULTI INCR +
PEXPIRE ... NX EXEC` per-account counter, fail-open.
- `apps/api/src/modules/auth/auth.routes.ts`: `preHandler` on
  register/login/forgot-password calling the new helper; 429 via the
  existing `AuthServiceError` convention.
- `apps/api/src/lib/account-rate-limit.test.ts` (new, 6 tests, mocked Redis).
- `apps/api/src/modules/auth/auth.routes.test.ts`: new describe block, live
  against the real Redis (`it.skipIf` when `REDIS_URL` unset; CI sets it
  unconditionally). `beforeEach` flushes the rate-limit key namespaces first
  — real external Redis state persists across test runs, unlike the
  in-memory store every other test in the file uses; caught this via a real
  flaky failure on a second back-to-back local run before adding the flush.
- `apps/api/src/routes/health.test.ts`: fixed a real regression this ticket
  surfaced — the mocked `ioredis` client lacked `defineCommand`, which
  `RedisStore`'s constructor now calls unconditionally on any non-null
  `app.redis`. Fixed by predefining `rateLimit`/`rateLimitRead` directly on
  the mock instead (sidesteps needing to fake `defineCommand`'s dynamic
  machinery for a suite unrelated to rate limiting).

## Validation results

- `pnpm --filter api exec eslint .`: clean.
- `pnpm --filter api typecheck`: clean.
- `pnpm --filter api test` (real Postgres + real Redis): 313 passed, 1
  skipped (RUN_LIVE_S3_TESTS gate) — run twice back to back, both clean.
- `pnpm turbo run lint typecheck build`: 24/24 green.
- `pnpm turbo run test`: 5/5 packages green.
- Live fail-open check: stopped `redis` container, confirmed login replied
  `401` in ~1.3s (not hung/500), restarted container, re-ran full suite
  clean.

## Discovered issues

- KI-048 (new): nothing calls `app.close()` on SIGTERM/SIGINT —
  `server.ts` never registers a signal handler, so `queue.ts`'s `onClose`
  hook (which assumes a real graceful shutdown triggers it) never runs on a
  real `docker stop`. Not fixed here (out of CR-058's scope) — recorded as
  CR-094 in `docs/tasks.md`.

## Final result

CR-058 closed. Both rate-limit tiers are Redis-backed and fail-open,
live-verified against a real Redis including a real Redis-down scenario.
KI-022 resolved (moved to known-issues.md's Resolved section). Only two
open, actionable tickets remain in `docs/tasks.md`: CR-086 (cover image
pipeline) and CR-094 (graceful shutdown, KI-048). `docs/tasks.md`,
`docs/changelog.md`, `.claude/context/project-state.md`,
`.claude/context/known-issues.md` all updated.
