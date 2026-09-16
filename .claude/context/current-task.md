# Current task

## Task ID

CR-050 — "Async notification delivery via Redis queue (decoupled from registration
transaction)".

## Goal

`.claude/rules/resilience.md`: notification delivery "must run outside the
request/response cycle and outside the critical transaction" via a Redis queue.
KI-040 documents the current interim posture: all three notification producers
(`registration_confirmed` on register/waitlist-promotion, `ride_update` fan-out,
`ride_cancelled` fan-out — `apps/api/src/modules/notifications/notifications.service.ts`)
insert directly into `notifications` in the same request, right after (never inside)
the triggering transaction, log-and-swallow on failure. This task moves that insert
onto a real BullMQ/Redis queue, processed by an in-process worker (no second
deployable service — ADR-008), while preserving the same fallback behavior when Redis
isn't configured (this environment — KI-014, Docker unreachable).

## Requirements / acceptance criteria

- `apps/api/src/redis.ts`'s existing `createRedisClient` factory is the first real
  consumer (its own doc comment already named CR-050/BullMQ as the anticipated use).
- New `bullmq` dependency in `apps/api`.
- A `notifications` BullMQ queue + an in-process `Worker` (same Fastify process,
  started/stopped via `onClose`, not a separate deployable — resilience.md's "do not
  introduce a second deployable service ... without a new ADR").
- `app.notificationQueue: NotificationQueue | null` decorator — `null` when
  `REDIS_URL` isn't configured, same "not configured is a degraded mode, never a
  boot-time crash" pattern as `app.s3` (`plugins/s3.ts`).
- All three producers: if the queue is configured, enqueue (return immediately,
  actual insert happens in the worker); if not, fall back to today's direct
  synchronous insert — preserves existing `apps/api` test-suite behavior with zero
  code changes to those tests (test env never sets `REDIS_URL`).
- A job failure (after BullMQ's own bounded retries) must be logged, never silently
  disappear (resilience.md) — and must never roll back or block the action that
  enqueued it, same as today's contract.
- No caller-visible change to `createRegistrationConfirmedNotification`/
  `notifyRideCancelled`/`createRideUpdate`'s own contract beyond the new `queue`
  parameter — callers (`registrations.service.ts`, `rides.service.ts`,
  `notifications.routes.ts`) thread `app.notificationQueue` through, same shape as
  `app.db`/`app.log` already are.
- Own unit tests for the queue module (mocked `bullmq`, no real Redis needed — same
  "mock the SDK" precedent as `route-storage.ts`'s S3 tests). Existing route-level
  integration tests for registrations/rides/notifications must keep passing
  unmodified (they exercise the no-Redis fallback path).
- Context docs updated: `docs/tasks.md`, `docs/changelog.md`,
  `.claude/context/project-state.md`, `.claude/context/known-issues.md` (KI-040
  update — resolved/narrowed; KI-014 stays open, live Redis still unverified in this
  environment).

## Planned files

- `apps/api/package.json` (+ `bullmq` dependency).
- `apps/api/src/modules/notifications/queue.ts` (new) — `NotificationQueue`
  interface, `registerNotificationQueue(app, env)`.
- `apps/api/src/modules/notifications/queue.test.ts` (new) — mocked `bullmq`.
- `apps/api/src/modules/notifications/notifications.service.ts` — split each
  producer's DB-insert into a raw internal function (reused by both the sync
  fallback and the worker's job processor), add `processNotificationJob` dispatcher,
  thread `queue: NotificationQueue | null` through the three exported producers.
- `apps/api/src/modules/registrations/registrations.service.ts` (`createRegistration`,
  `cancelRegistration` — new `queue` param).
- `apps/api/src/modules/rides/rides.service.ts` (`cancelRide` — new `queue` param).
- `apps/api/src/modules/registrations/registrations.routes.ts`,
  `apps/api/src/modules/rides/rides.routes.ts`,
  `apps/api/src/modules/notifications/notifications.routes.ts` — pass
  `app.notificationQueue` at each call site.
- `apps/api/src/app.ts` — `registerNotificationQueue(app, env)` after `registerDb`.
- `docs/architecture.md`, `.claude/context/architecture-map.md` if the module map
  needs updating; `docs/tasks.md`, `docs/changelog.md`,
  `.claude/context/project-state.md`, `.claude/context/known-issues.md`.

## Implementation progress

- [x] Read context, confirmed no direct unit tests call the affected service
      functions (only route-level integration tests, which never set `REDIS_URL`).
- [x] `bullmq` dependency added.
- [x] `queue.ts` implemented + unit-tested (6 tests, mocked `bullmq`/`ioredis`).
- [x] `notifications.service.ts` refactored (raw insert fns + `processNotificationJob` + `queue` param threaded through producers).
- [x] Call sites updated (`registrations.service.ts`, `rides.service.ts`,
      3 routes files, `app.ts`).
- [x] Validation: typecheck/lint/test/build.
- [x] Context docs updated.

## Validation results

`pnpm --filter api run typecheck`/`lint`/`build` — all clean.
`pnpm --filter api run test` (real local Postgres) — 261/261 passed across 14 files
(255 pre-existing + 6 new `queue.test.ts`), zero changes to any pre-existing test file
— every existing route-level test exercises the no-`REDIS_URL` fallback path
unmodified.
`pnpm turbo run typecheck lint --filter=api --filter=resilience` — clean (full-turbo
cache hit on unrelated packages). The one `packages/ui` failure seen under a full
parallel `pnpm turbo run typecheck lint test build` was confirmed unrelated and a
pre-existing resource-contention flake, not a regression from this task: `pnpm
--filter ui run test` in isolation passes 90/90, and `git diff` confirms
`packages/ui` was never touched by this task.
Manual live verification against this environment's genuinely unreachable Redis
(KI-014): booted `apps/api` with `REDIS_URL` configured — server starts cleanly,
logs connection errors, never crashes. A standalone script (built, run, then
deleted — never committed) exercising `registerNotificationQueue` directly found a
real bug: naively awaiting `queue.add()`/`worker.close()`/`queue.close()` hangs
indefinitely against a truly unreachable Redis (confirmed: one `add()` call did not
return within 120s). Fixed with a hand-rolled `raceTimeout` (`Promise.race` against a
plain timer, not `callWithResilience` — BullMQ accepts no `AbortSignal` to race
against). Re-verified after the fix: `add()` fails in ~1.5s per call, the circuit
breaker opens after 5 consecutive failures (6th call fails in 0ms), and shutdown
completes cleanly within the bounded 3s-per-close window instead of hanging.

## Discovered issues

BullMQ's `Queue.add()`/`Worker.close()`/`Queue.close()` do not bound themselves
against an unreachable Redis — `callWithResilience`'s `timeoutMs` is a no-op for
them since they accept no `AbortSignal`. Not caught by unit tests (mocked `bullmq`
resolves immediately) or by the existing test suite (never configures `REDIS_URL`)
— only found via manual live verification against this environment's real,
unreachable Redis. Fixed with `queue.ts`'s hand-rolled `raceTimeout`; documented in
`docs/changelog.md`'s CR-050 entry and `.claude/context/architecture-map.md` so the
reasoning survives (don't "simplify" this back to a bare `callWithResilience` call
later without re-reading why).

## Final result

CR-050 is complete and shipped. New `apps/api/src/modules/notifications/queue.ts`
wires a `bullmq` producer `Queue` + in-process `Worker` on one `notifications` queue
(ADR-008: no second deployable service), decorating
`app.notificationQueue: NotificationQueue | null`. All three notification producers
(`createRegistrationConfirmedNotification`, `notifyRideCancelled`, the fan-out inside
`createRideUpdate`) enqueue when configured, falling back to the pre-existing direct
synchronous insert when `REDIS_URL` isn't set — so this environment's behavior
(KI-014, Docker unreachable) is unchanged today, while production gets real
request/response decoupling once `REDIS_URL` points at a real Redis. Both the
per-enqueue call and graceful shutdown are bounded by an explicit timeout (not
`callWithResilience`, for the documented reason above) plus a shared `CircuitBreaker`
so a sustained outage never taxes every request. KI-040 is resolved. Next logical
task: CR-051 (health check endpoint reporting DB/Redis/S3 status) — a natural
consumer of this same connection-reachability signal.
