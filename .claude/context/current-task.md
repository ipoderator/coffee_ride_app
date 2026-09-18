# Current task

## Task ID

CR-077 — Redis hardening: password, AOF persistence, healthcheck
(`docs/tasks.md` Deployment section, KI-003).

## Goal

Close the remaining gap KI-003 identifies for the local-dev `redis` service in
`docker-compose.yml`: it currently runs unauthenticated and without AOF
persistence, so a container restart silently drops queued notification jobs
(CR-050) and an unauthenticated Redis is a takeover vector on any host where
the port binding is ever widened. A healthcheck already exists (added by
CR-009/CR-010) — KI-003's text was stale on that point, corrected here.

## Investigation

- `docker-compose.yml`'s `redis` service: image `redis:8-alpine`, port bound
  to `127.0.0.1:6379:6379` only, a named volume (`redis_data:/data`), and a
  `redis-cli ping` healthcheck already in place. No `command:` override — runs
  with Redis's all-defaults config: no `requirepass`, and the default
  `appendonly no` (RDB snapshotting only, not AOF).
- `apps/api/src/redis.ts`'s `createRedisClient(url, options)` is a thin
  `ioredis` factory reading a full connection URL — `ioredis` parses
  `redis://:<password>@host:port` natively, so an authenticated URL needs no
  code change, only the URL value changing in `.env.example` (and whatever
  real value an operator sets in their own `.env`).
- `apps/api/src/routes/health.ts`'s `checkRedis` just calls `app.redis.ping()`
  through the same already-configured client — also needs no code change.
- `docker-compose.prod.yml` (ADR-018/CR-075) deliberately runs no Redis
  service of its own — it assumes `REDIS_URL` already points at a real,
  externally provisioned instance. So this ticket's `command:`/healthcheck
  change only applies to the local-dev `redis` service; production hardening
  is "whatever provisions that real instance must set a password and enable
  persistence," documented as guidance in `.env.example` rather than compose
  config this repo doesn't own.
- `.github/workflows/ci.yml` does set `REDIS_URL: redis://localhost:6379` and
  runs its own separate `redis` GitHub Actions service container (not
  `docker-compose.yml` — CI defines its services directly in the workflow
  YAML) — unaffected by this change either way. `apps/api/src/modules/
notifications/queue.test.ts` and `routes/health.test.ts` both fully mock
  `ioredis` (`vi.mock('ioredis', ...)`, confirmed) rather than connecting
  live, so the literal `REDIS_URL` values in those test files are inert
  fixture strings, not real connection attempts — no test changes needed.
- Checked `apps/api/src/env.ts`: `REDIS_URL` is `z.string().url().optional()`
  — a URL with embedded credentials (`redis://:pw@host:port`) still parses as
  a valid URL, no schema change needed.

## Decision

- `docker-compose.yml`'s `redis` service gains `command: redis-server
--requirepass redis-dev-only --appendonly yes` — a literal dev-only
  password, same pattern as `postgres`'s `POSTGRES_PASSWORD: postgres` and
  `minio`'s `MINIO_ROOT_PASSWORD: minio12345` already in this same file
  (plain values, not `${VAR}`-substituted like `docker-compose.prod.yml`,
  since this file is explicitly "local development infrastructure only" per
  its own header comment and is bound to `127.0.0.1`).
- Healthcheck updated to `redis-cli --no-auth-warning -a redis-dev-only ping`
  — `--no-auth-warning` suppresses `redis-cli`'s stderr warning about
  passing a password on the command line (expected/known here, not a real
  leak risk inside a healthcheck run by the Docker engine itself).
- `.env.example`'s `REDIS_URL` updated to
  `redis://:redis-dev-only@localhost:6379` to match, with a comment
  explaining the value is dev-only and that a production `REDIS_URL` must
  point at a real, separately-hardened instance (password + persistence are
  that instance's own operator's responsibility — this repo's
  `docker-compose.prod.yml` never starts one, per ADR-018).
- KI-003: mark resolved (moved to Resolved section) — its "no healthcheck"
  claim was already stale (CR-009/CR-010 added one); this ticket closes the
  remaining password/AOF gap.

## Requirements / acceptance criteria

- Local-dev `redis` service requires a password and persists via AOF.
- `apps/api`'s Redis client continues to work with an authenticated
  `REDIS_URL` with no source-code change (ioredis parses embedded
  credentials natively).
- `docker compose config` parses cleanly with the new `command:` line.
- No change to production compose (`docker-compose.prod.yml` still runs no
  Redis of its own, per ADR-018) — this ticket only touches local dev.
- `pnpm turbo run lint typecheck build test` stays green (no application
  source changes expected, but re-run to confirm nothing regressed).

## Planned files

- `docker-compose.yml` (`redis` service: `command:`, healthcheck).
- `.env.example` (`REDIS_URL` value + comment).
- `.claude/context/known-issues.md` (KI-003 resolved).
- `docs/tasks.md` (check off CR-077).
- `docs/changelog.md` (append), `.claude/context/project-state.md` (overwrite).

## Implementation progress

- [x] `docker-compose.yml` `redis` service hardened.
- [x] `.env.example` `REDIS_URL` updated.
- [x] `docker compose config` validated.
- [x] `pnpm turbo run lint typecheck build test`.
- [x] Update docs/context (`docs/tasks.md`, `docs/changelog.md`,
      `project-state.md`, `known-issues.md` — KI-003 resolved).

## Validation results

`docker compose -f docker-compose.yml config` parsed cleanly with the new
`command: [redis-server, --requirepass, redis-dev-only, --appendonly, "yes"]`
and authenticated healthcheck — confirmed via direct inspection of the
rendered config output. `pnpm turbo run lint typecheck build test` (with
`DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`, this
environment's real local Postgres, same as CR-079's validation): 29/29 turbo
tasks green, `apps/api`'s full suite 299/299 tests passing — this ticket
touched no application source (only `docker-compose.yml`/`.env.example`), so
the full re-run is confirmation nothing regressed, not new coverage. Docker's
daemon remains unreachable in this environment (KI-019), so a live
authenticated boot (`docker compose up`, a real `redis-cli -a ... ping`
against a running container) was not exercised — same limitation every prior
Deployment-section ticket in this environment has had.

## Discovered issues

None new. Corrected a stale claim in KI-003 itself while resolving it: its
"no healthcheck" wording predated CR-009/CR-010 (2026-09-13), which had
already added one — the remaining real gap was password + AOF only.

## Final result

Done. Local-dev `redis` (`docker-compose.yml`) now requires a password and
persists via AOF (`--requirepass redis-dev-only --appendonly yes`); its
healthcheck authenticates too. `.env.example`'s `REDIS_URL` matches
(`redis://:redis-dev-only@localhost:6379`) — no application code change was
needed, since `ioredis` (`apps/api/src/redis.ts`) parses embedded
credentials natively and `apps/api/src/routes/health.ts`'s Redis check just
calls `.ping()` through the already-configured client. `docker-compose.prod.yml`
(ADR-018) is untouched — it still runs no Redis of its own, by design; a
production instance's hardening stays that instance's own operator's
responsibility. KI-003 resolved. Full repo lint/typecheck/build/test green
(29/29 turbo tasks, 299 `apps/api` tests). Next logical task: CR-078
(Postgres backups) is the one Deployment-section ticket that was open before
this one and remains open; CR-080 (CI gaps), CR-081 (env var set +
deployment docs), CR-082 (pin MinIO) round out the section, no fixed order
decided among them.
