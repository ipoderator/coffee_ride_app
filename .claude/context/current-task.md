# Current task

## Task ID

CR-079 — Structured logging (pino + request id) and error reporting;
background job failures must be visible (`.claude/rules/resilience.md`,
KI-006).

## Goal

Give `apps/api` a real request-id correlation mechanism across the CR-075
reverse-proxy hop, and a single funnel that every unexpected 500 and every
background job failure goes through, so "must be visible" means the same
thing in both places — with an optional external-sink extension point since
no error-tracking provider is decided/configured yet (no ADR names one).

## Investigation

- `apps/api/src/app.ts` already runs Fastify's built-in pino logger: JSON in
  production/test, `pino-pretty` only in development — that half of
  "structured logging" pre-dates this ticket (its own comment already said
  "CR-079 builds on this later").
- Fastify's default `genReqId` is a per-process incrementing counter
  (`req-1`, `req-2`, ...) — useless for correlating a request across the
  CR-075 Caddy → web → api hop. No code currently reads/echoes
  `X-Request-Id`.
- `apps/api/src/plugins/error-handler.ts`'s 500 branches and
  `apps/api/src/modules/notifications/queue.ts`'s `worker.on('failed', ...)`
  each already call `*.log.error(...)` independently — real logging exists,
  but there's no single funnel, and no extension point for forwarding to an
  external error tracker later.
- Checked `docs/decisions.md`/`docs/architecture.md`/`docs/product.md` for an
  existing choice of error-tracking vendor (Sentry or otherwise): none
  exists. ADR-016's own rationale ("no metrics/observability hook ... add
  when actually needed, not speculatively") confirms this hasn't been
  decided yet — so this ticket cannot wire a specific vendor SDK without
  inventing an undecided architectural choice. Resolution: build the funnel
  plus a generic optional webhook sink behind an env var, same "null is a
  supported degraded mode" shape already used for S3/Redis
  (`plugins/s3.ts`, `redis.ts`) — a real vendor integration is a future
  ticket once one is actually chosen.
- Confirmed `packages/resilience`'s `callWithResilience` accepts a `breaker`
  directly in its options and manages `canAttempt`/`recordSuccess`/
  `recordFailure` internally (unlike `queue.ts`'s hand-rolled breaker calls,
  which exist only because BullMQ's `Queue.add()` doesn't honor
  `AbortSignal` — `fetch` does, so the webhook sink can use
  `callWithResilience` directly, same pattern as
  `packages/maps-2gis/src/http.ts`'s `fetchJson`).

## Decision

- New `apps/api/src/lib/request-id.ts`: `generateRequestId(req)` reads
  `X-Request-Id` from the raw incoming request, validates it against a
  bounded charset/length (untrusted header value feeding straight into every
  subsequent log line is a log-injection/log-volume surface, not just
  cosmetic), falls back to `randomUUID()`. Wired into `app.ts` via
  Fastify's `genReqId` option; an `onSend` hook echoes `request.id` back as
  the `X-Request-Id` response header so a caller (or Caddy) can see the id
  actually used.
- `app.ts`'s pino config gains `base: { service: 'api' }` — once
  api/migrate/web all ship logs to one pipeline, this is what tells them
  apart.
- New `apps/api/src/plugins/error-reporting.ts`: decorates
  `app.reportError(error, message, context?, logger?)`. Always logs
  structurally via the given logger (defaults to `app.log`; call sites pass
  `request.log` where available so the request's bound `reqId` carries
  through) — this alone satisfies "must be visible" with zero external
  config. If `ERROR_REPORTING_WEBHOOK_URL` is set, additionally POSTs the
  error as JSON to that URL via `callWithResilience` with one _shared_
  `CircuitBreaker` (not per-call, per `.claude/rules/resilience.md`) —
  fire-and-forget, never throws back into the caller, an open breaker is
  not itself logged (expected noise during a sustained outage).
- `env.ts`: new optional `ERROR_REPORTING_WEBHOOK_URL` (no production
  placeholder check needed — unset is a legitimate "not configured yet"
  production state, same as `REDIS_URL`/`S3_*` today).
- `error-handler.ts`'s two `>=500` branches call `app.reportError(...)`
  instead of logging directly; `<500` branch keeps its existing
  `request.log.warn(...)` (not every 4xx is an "error" worth this funnel).
- `queue.ts`'s `worker.on('failed', ...)` (job failed after exhausting
  retries — the actual "background job failure" resilience.md means) calls
  `app.reportError(...)` instead of logging directly. Left unchanged,
  deliberately: `worker.on('error', ...)`, `queue.on('error', ...)`, and both
  Redis connections' `.on('error', ...)` — these are connection-level/
  transient-outage noise, not job failures, and routing them through the
  same funnel would trip the webhook sink's breaker on ordinary Redis
  hiccups instead of real failures.
- `docker-compose.prod.yml`'s `api` service gains
  `ERROR_REPORTING_WEBHOOK_URL: ${ERROR_REPORTING_WEBHOOK_URL}`;
  `.env.example` documents it as optional, deployment-only.
- Not doing (real out-of-scope): picking/wiring an actual error-tracking
  vendor SDK (Sentry or otherwise) — no such decision exists yet (see
  Investigation); metrics/tracing — ADR-016 already deferred that
  explicitly and nothing here changes that.

## Requirements / acceptance criteria

- Every request gets a stable `request.id`: an inbound valid `X-Request-Id`
  is reused, otherwise one is generated; the response always echoes
  `X-Request-Id`.
- A malformed/oversized inbound `X-Request-Id` is rejected (server
  generates its own) rather than trusted verbatim into logs.
- Every unexpected 500 and every notification-job failure-after-retries goes
  through `app.reportError`, which always logs structurally and optionally
  forwards to a configured webhook sink without ever blocking/throwing back
  into the caller.
- `pnpm turbo run lint typecheck build test` stays green.

## Planned files

- `apps/api/src/lib/request-id.ts` (new) + test.
- `apps/api/src/plugins/error-reporting.ts` (new) + test.
- `apps/api/src/app.ts` (wire `genReqId`/onSend hook, `base` field, register
  error reporting before the error handler).
- `apps/api/src/plugins/error-handler.ts` (route >=500 through
  `app.reportError`).
- `apps/api/src/modules/notifications/queue.ts` (route job-failed through
  `app.reportError`).
- `apps/api/src/env.ts` (`ERROR_REPORTING_WEBHOOK_URL`).
- `apps/api/src/app.test.ts` (request-id coverage).
- `docker-compose.prod.yml`, `.env.example`.
- `docs/tasks.md` (check off CR-079), `docs/changelog.md` (append),
  `.claude/context/project-state.md` (overwrite), `.claude/context/
known-issues.md` (KI-006 resolved).

## Implementation progress

- [x] `lib/request-id.ts` + test.
- [x] `plugins/error-reporting.ts` + test.
- [x] Wire into `app.ts`.
- [x] Update `error-handler.ts`.
- [x] Update `queue.ts` (+ extended `queue.test.ts` to capture the `'failed'`
      handler and assert it calls `app.reportError`).
- [x] `env.ts` (+ `z.preprocess` for the Compose empty-string gotcha,
      KI-046) + `.env.example` + `docker-compose.prod.yml`.
- [x] Extend `app.test.ts` for request-id behavior.
- [x] Full `pnpm turbo run lint typecheck build test`.
- [x] Update docs/context (`docs/tasks.md`, `docs/changelog.md`,
      `project-state.md`, `known-issues.md` — KI-006 resolved, KI-046 new).

## Validation results

`pnpm --filter api exec tsc --noEmit` and `pnpm --filter api exec eslint .`
both clean, run directly. `pnpm --filter api exec vitest run` (against this
environment's real local Postgres, `DATABASE_URL` from `.env` —
`postgresql://glebchurkin@localhost:5432/coffee_ride_dev`, not Docker/KI-019):
299/299 tests passed, including new `lib/request-id.test.ts` (5 tests),
`plugins/error-reporting.test.ts` (7 tests — structured logging always fires,
webhook POST + exact payload shape via a stubbed global `fetch`, webhook
failure logged as a warning without throwing, breaker trips after 5
consecutive failures with no sixth `fetch` call), 3 new `app.test.ts` cases
(real `.inject()` round trips: inbound id reused+echoed, one generated when
absent, a malformed one rejected and replaced), and one new `queue.test.ts`
case (captures the mocked `Worker`'s `'failed'` handler, asserts it calls
`app.reportError` with the right job context). Live-observed the real JSON
log line during the run: `{"level":30,...,"service":"api",
"reqId":"<uuid>",...}` — `base`/`genReqId` confirmed to actually take effect
at runtime, not just typecheck. Full `pnpm turbo run lint typecheck build
test`: 29/29 tasks green (first run showed a `web#build` failure —
`<Html> should not be imported outside of pages/_document` on `/500` —
root-caused to a stale `apps/web/.next` cache from an earlier session
combined with `NODE_ENV=development` leaking into the build from manually
sourcing `.env`; deleting `.next` and invoking turbo with only `DATABASE_URL`
set, not the whole `.env`, fixed it — confirmed unrelated to this ticket's
changes since `apps/web` was never touched). `docker compose -f
docker-compose.prod.yml config` with realistic env values showed
`ERROR_REPORTING_WEBHOOK_URL: ""` for the api service when unset — exactly
the Compose empty-string behavior KI-046 describes; confirmed live via `tsx`
that `env.ts`'s `loadEnv` accepts that empty string and resolves
`ERROR_REPORTING_WEBHOOK_URL` to `undefined` (not a crash).

## Discovered issues

KI-046 (new): `docker-compose.prod.yml`'s `api` service wires
`REDIS_URL`/`S3_ENDPOINT`/`ERROR_REPORTING_WEBHOOK_URL` through `${VAR}`
unconditionally; Compose substitutes an empty string for an unset var, which
a bare `z.string().url().optional()` rejects. Fixed for the new field this
ticket added; `REDIS_URL`/`S3_ENDPOINT` carry the same pre-existing gotcha,
left as-is (unrelated-changes discipline) and recorded rather than silently
carried forward.

## Final result

Done. `apps/api` now correlates requests across the CR-075 Caddy → web → api
hop via a validated, echoed `X-Request-Id` (`lib/request-id.ts`), and every
unexpected 500 and every notification job that exhausts its retries goes
through one funnel, `app.reportError` (`plugins/error-reporting.ts`) —
always logging structurally (satisfying "must be visible" with zero external
config) and optionally forwarding to a webhook sink once an operator
actually configures `ERROR_REPORTING_WEBHOOK_URL` (no vendor decided yet,
deliberately not invented here). KI-006 resolved. Found and fixed a real
edge case along the way rather than just wiring the new field blindly
(KI-046's `z.preprocess` fix, confirmed live). Full repo lint/typecheck/
build/test green (29/29 turbo tasks, 299 `apps/api` tests). Next logical
task: no fixed order decided between CR-077 (Redis hardening) and CR-078
(Postgres backups) — both were already open before this ticket and remain
so; CR-080 (CI gaps), CR-081 (env var set + deployment docs), and CR-082
(pin MinIO) round out the Deployment section.
