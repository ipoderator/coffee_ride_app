# Current task

## Task ID

CR-051 — "Health check endpoint (`apps/api`) reporting DB/Redis/S3 status".

## Goal

`.claude/rules/resilience.md`: "`apps/api` exposes a health check endpoint that
reports the status of its own dependencies (DB, Redis, S3) without dying if one is
degraded." `docs/api.md`'s `## Health` section already documents the contract (`GET
/health`, unversioned per ADR-011, "reports DB/Redis/S3 status; must not fail hard
if one dependency is degraded"). `apps/api/src/routes/health.ts` was a
bootstrap-only stub (`{ status: 'ok' }`, no dependency checks) whose own comment
named this ticket as the one that replaces the handler body.

## Requirements / acceptance criteria

- `GET /health` always returns `200` (never fails hard) with per-dependency status
  plus an overall summary.
- DB check: a real, bounded round trip against `app.db` (`select 1`), not just "the
  pool object exists."
- Redis check: `not_configured` when Redis isn't configured (`REDIS_URL` unset,
  KI-014) — reuses CR-050's existing producer connection rather than opening a
  fourth Redis connection just for this ping; a real bounded `PING` otherwise.
- S3 check: `not_configured` when `app.s3` is null (KI-015), a real bounded
  `HeadBucketCommand` otherwise, using the AWS SDK's `abortSignal` (properly
  timeout-bound, unlike DB/Redis).
- None of the three checks may hang the request: DB/Redis use a hand-rolled
  `Promise.race` timeout (neither honors `AbortSignal`, same gotcha CR-050 already
  hit and documented for BullMQ); S3 uses `packages/resilience`'s
  `callWithResilience` (timeout only, no retry/breaker — a diagnostic ping, not a
  retried business operation).
- `not_configured` is not the same as `error` — an intentionally-absent optional
  dependency (this environment, KI-014/KI-015) must not read as "degraded."
- Own unit tests for the route (mocked `@aws-sdk/client-s3`/`ioredis`/`bullmq`, no
  live infrastructure needed — same precedent as `queue.test.ts`/
  `route.routes.test.ts`).
- Context docs updated: `docs/tasks.md`, `docs/changelog.md`,
  `.claude/context/project-state.md`, `.claude/context/architecture-map.md`.

## Planned files

- `apps/api/src/lib/race-timeout.ts` (new) — extract the `raceTimeout` helper
  `queue.ts` already had privately.
- `apps/api/src/modules/notifications/queue.ts` — import the extracted helper;
  decorate `app.redis: RedisClient | null` alongside `app.notificationQueue` (same
  producer connection, reused not duplicated).
- `apps/api/src/routes/health.ts` — real DB/Redis/S3 checks, replacing the stub.
- `apps/api/src/routes/health.test.ts` (new).
- `apps/api/src/app.test.ts` — remove the now-superseded bootstrap-stub `/health`
  assertion.
- `docs/tasks.md`, `docs/changelog.md`, `.claude/context/project-state.md`,
  `.claude/context/architecture-map.md`.

## Implementation progress

- [x] Read context (docs/api.md's Health section, resilience.md, the existing
      health.ts stub, db/s3/queue plugins).
- [x] `race-timeout.ts` extracted; `queue.ts` updated to use it (no behavior
      change — same tests pass unmodified).
- [x] `app.redis` decoration added (reuses `queue.ts`'s producer connection).
- [x] `health.ts` real checks implemented (db/redis/s3, always `200`).
- [x] Unit tests written (`health.test.ts`, 5 tests); removed the superseded
      `/health` assertion from `app.test.ts`.
- [x] Validation: typecheck/lint/test/build all clean.
- [x] Context docs updated.

## Validation results

`pnpm --filter api run typecheck`/`lint`/`build` — all clean.
`pnpm --filter api run test` (real local Postgres) — 265/265 passed across 15
files (260 pre-existing minus the 1 removed stub assertion, plus 5 new
`health.test.ts`), no other pre-existing test modified.
`pnpm turbo run typecheck lint --filter=api --filter=resilience --filter=db` —
clean.
Manual live verification: booted `apps/api` (`tsx src/server.ts`) with this
environment's real local Postgres reachable and Redis/S3 genuinely unreachable
(KI-014/KI-015/KI-019, Docker down) — `curl /health` returned `200` with
`{"status":"degraded","dependencies":{"db":"ok","redis":"error","s3":"error"}}`,
confirming the endpoint distinguishes a live dependency from a real failure and
never fails hard. Server stopped afterward; no artifacts left behind.

## Discovered issues

None new. Confirmed (not just assumed) that `db.execute`/`ioredis`'s `.ping()`
don't honor `AbortSignal` the same way BullMQ's calls don't (CR-050) — this is why
`raceTimeout` was extracted into a shared helper rather than reasoned about
per-call-site.

## Final result

CR-051 is complete and shipped. `GET /health` now runs a real, bounded check per
dependency instead of returning a static stub: DB via a timed `select 1`, Redis via
a timed `PING` on the same connection `notifications/queue.ts` already owns
(`app.redis`, new decoration), S3 via a timed `HeadBucketCommand` (the one check
that gets a real `AbortSignal`-backed timeout via `callWithResilience`, since the
AWS SDK honors it and neither postgres.js nor ioredis do). Response is
`{ status: 'ok' | 'degraded', dependencies: { db, redis, s3 } }`, each one of
`'ok' | 'error' | 'not_configured'` — an unconfigured optional dependency never
reads as a failure. Always `200`. `raceTimeout` (the hand-rolled `Promise.race`
timeout CR-050 introduced for BullMQ) is now a shared helper
(`apps/api/src/lib/race-timeout.ts`) instead of living only inside `queue.ts`.
Live-verified against this environment's real constraints (reachable Postgres,
unreachable Redis/S3) rather than only unit-tested. Resilience section of
`docs/tasks.md` now has exactly one open ticket left: CR-052 (frontend
degraded-state handling), a natural consumer of this endpoint's per-dependency
detail.
