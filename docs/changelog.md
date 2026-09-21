# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

## Archiving (keep this file cheap to read)

When this file exceeds ~40 entries, move all but the most recent ~15 into
`docs/changelog-archive/YYYY.md` (one file per year), preserving order and content exactly.
Leave a one-line pointer at the top of this file's history section noting the archive exists.
Commands (`/next`, `/status`) only need to read the last 5-10 entries of the _live_ file —
the archive exists for humans and for deep audits, not for routine agent context.

## Format

```
## YYYY-MM-DD — CR-XXX — short title
Summary: what changed, in 1-3 sentences.
Files: key files/dirs touched.
Decisions: link to docs/decisions.md entry if an ADR was created, otherwise "none".
Follow-up: anything deferred, or "none".
```

---

Entries before CR-079 (CR-000 through CR-076, 2026-09-09..2026-09-17) were moved
to `docs/changelog-archive/2026.md` on 2026-09-20, per this section's own rule —
the live file had grown past ~40 entries again.

## 2026-09-17 — CR-079 — Request-id correlation and a single error-reporting funnel (KI-006)

Summary: `apps/api` already logged structurally in production (JSON via pino,
CR-079's own comment in `app.ts` said "builds on this later"), but had no
request-id correlation across the CR-075 Caddy -> web -> api hop, and no
single funnel an unexpected 500 and a background job failure both went
through — each logged independently, with no extension point for a future
external error tracker.
Investigation: checked `docs/decisions.md`/`docs/architecture.md`/
`docs/product.md` for an existing error-tracking vendor decision — none
exists; ADR-016's own rationale ("no metrics/observability hook ... add when
actually needed, not speculatively") confirms this was deliberately
undecided. Wiring a specific vendor SDK (Sentry or otherwise) would have
invented an architectural choice nobody made, so this ticket builds the
funnel plus a generic optional webhook sink instead — the same "null is a
supported degraded mode" shape `plugins/s3.ts`/`redis.ts` already use for
undecided/not-yet-configured integrations.
Implementation: new `apps/api/src/lib/request-id.ts` (`generateRequestId`)
wired into `app.ts` as Fastify's `genReqId` — reuses a valid inbound
`X-Request-Id` (bounded charset/length; an untrusted header feeding straight
into every log line is a log-injection/volume surface, not just cosmetic),
otherwise generates a UUID; an `onSend` hook echoes it back as the response
header. `app.ts`'s pino config gained `base: { service: 'api' }` for when
api/migrate/web all ship to one log pipeline. New
`apps/api/src/plugins/error-reporting.ts` decorates
`app.reportError(error, message, context?, logger?)`: always logs
structurally (the always-on mechanism that alone satisfies "must be
visible"); if `ERROR_REPORTING_WEBHOOK_URL` is configured, additionally
POSTs the error as JSON via `callWithResilience` with one _shared_
`CircuitBreaker` (`.claude/rules/resilience.md`: shared across every call,
not per-call) — fire-and-forget, never throws back into the caller.
`error-handler.ts`'s two `>=500` branches and `queue.ts`'s
`worker.on('failed', ...)` (a job that exhausted its retries — the actual
"background job failure" resilience.md means) now go through
`app.reportError` instead of logging directly; connection-level `.on('error',
...)` handlers (Redis, BullMQ queue/worker) were deliberately left logging
directly — those fire repeatedly on ordinary outage noise and would trip the
webhook sink's breaker on transient hiccups instead of real failures.
`env.ts` gained `ERROR_REPORTING_WEBHOOK_URL` (optional, `z.preprocess`
normalizes an empty string to `undefined` before the `.url()` check — see
Discovered issues below for why that matters). `docker-compose.prod.yml`'s
`api` service and `.env.example` both wire it through, documented as
optional/deployment-only.
Decisions: none new at the ADR level — a real external error-tracking vendor
stays an open, undecided choice (consistent with ADR-016); this ticket only
builds the seam for one.
Validation: `pnpm turbo run lint typecheck build test` — 29/29 tasks green
(a stale `.next` cache from an earlier session made `apps/web`'s build fail
independently of this ticket's changes; deleting it and rebuilding fixed it
before this ticket's own validation ran). `apps/api`'s full suite — 299
tests, including new coverage in `lib/request-id.test.ts` (valid/oversized/
malformed/repeated header handling),
`plugins/error-reporting.test.ts` (structured logging with no sink
configured, webhook POST + payload shape, webhook failure logged as a
warning not thrown, breaker trips after 5 consecutive failures without a
sixth `fetch` call), and `app.test.ts` (a real `.inject()` round trip:
inbound id reused and echoed, one generated and echoed when absent, a
malformed one rejected and replaced) — ran live against real HTTP request
injection, not just unit-level. `queue.test.ts` extended to capture the
`Worker`'s `'failed'` handler and assert it calls `app.reportError` with the
right job context. Live-observed the real JSON log line during the full test
run: `{"level":30,...,"service":"api","reqId":"<uuid>",...}` — confirms
`base`/`genReqId` actually take effect, not just typecheck.
Discovered issues (KI-046, new): `docker-compose.prod.yml`'s `api` service
wires every optional env var through `${VAR}` unconditionally (`REDIS_URL`,
`S3_ENDPOINT`, now `ERROR_REPORTING_WEBHOOK_URL`) — Compose substitutes an
_empty string_, not an absent variable, for one unset in `.env`, which a
bare `z.string().url().optional()` rejects (only `undefined` counts as
absent), crashing boot. Fixed for the new field
(`ERROR_REPORTING_WEBHOOK_URL`'s `z.preprocess`, confirmed live via `tsx`
with an empty-string input); `REDIS_URL`/`S3_ENDPOINT` carry the same
pre-existing gotcha, out of scope here (unrelated-changes discipline) —
recorded as KI-046 rather than silently left for a real deploy to discover
with unset Redis.
Known limitations: KI-006 resolved (moved to Resolved section). KI-046 (new,
see above). No error-tracking vendor is chosen yet — the webhook sink is a
generic seam, unverified against any real endpoint (no vendor/credential
exists to verify against, consistent with `.claude/rules/resilience.md`'s
extension-point pattern for undecided integrations).
Follow-up: CR-077 (Redis hardening) and CR-078 (Postgres backups) are the
two Deployment-section tickets that were open before CR-079 and remain open
after it; CR-080 (CI gaps), CR-081 (env var set + docs), CR-082 (pin MinIO)
round out the section. KI-046 (the Compose empty-string gotcha for
`REDIS_URL`/`S3_ENDPOINT`) is worth folding into whichever of CR-077/CR-081
actually touches those variables next, rather than opening a dedicated
ticket for a two-line fix.

## 2026-09-18 — CR-077 — Redis hardening: password, AOF persistence (KI-003)

Summary: next open Deployment-section ticket after CR-079. KI-003 flagged the
local-dev `redis` service (`docker-compose.yml`) as unauthenticated and
without AOF persistence — a container restart silently dropped queued
notification jobs (CR-050), contradicting `.claude/rules/resilience.md`
("a failed background job must never silently disappear"). KI-003's "no
healthcheck" half was actually already stale: CR-009/CR-010 had added a
`redis-cli ping` healthcheck back on 2026-09-13; that correction is folded
into this ticket's close-out rather than opened as a separate note.
Investigation: `apps/api/src/redis.ts`'s `createRedisClient` is a thin
`ioredis` factory over a full connection URL — `ioredis` parses
`redis://:<password>@host:port` natively, so authenticating needed no
application code change, only the URL value. `docker-compose.prod.yml`
(ADR-018) runs no Redis service of its own — it assumes `REDIS_URL` already
points at a real, externally provisioned instance — so this ticket's scope
is the local-dev compose file only; a production instance's password/
persistence is that instance's own operator's responsibility.
`.github/workflows/ci.yml` runs its own separate `redis` GitHub Actions
service (not `docker-compose.yml`) and sets `REDIS_URL` to an unauthenticated
local value — confirmed unaffected either way, since
`queue.test.ts`/`health.test.ts` both fully mock `ioredis` rather than
connecting live.
Implementation: `docker-compose.yml`'s `redis` service gained `command:
redis-server --requirepass redis-dev-only --appendonly yes` — a literal
dev-only password, the same pattern this file already uses for `postgres`'s
`POSTGRES_PASSWORD`/`minio`'s `MINIO_ROOT_PASSWORD` (plain values, not
`${VAR}`-substituted like `docker-compose.prod.yml`, since this file is
explicitly "local development infrastructure only" and bound to
`127.0.0.1`). Healthcheck updated to `redis-cli --no-auth-warning -a
redis-dev-only ping`. `.env.example`'s `REDIS_URL` updated to
`redis://:redis-dev-only@localhost:6379` to match, with a comment steering a
production value toward a real, separately-hardened instance.
Decisions: none new at the ADR level — this operationalizes CR-077 exactly
as scoped in `docs/tasks.md`.
Validation: `docker compose -f docker-compose.yml config` parses cleanly
with the new `command:`/healthcheck lines (Docker's daemon is still
unreachable in this environment, KI-019, so a live authenticated boot was
not exercised). `pnpm turbo run lint typecheck build test`: 29/29 tasks
green, 299/299 `apps/api` tests passing (this ticket touched no application
source — the full suite re-run confirmed nothing regressed).
Known limitations: KI-003 resolved (moved to Resolved section). Production
Redis hardening (password, persistence) stays outside this repo's compose
manifests, per ADR-018 — an operator's responsibility wherever that instance
is actually hosted.
Follow-up: CR-078 (Postgres backups) is the next Deployment-section ticket
that was open before this one and remains open; CR-080 (CI gaps), CR-081
(env var set + docs), CR-082 (pin MinIO) round out the section, no fixed
order decided among them.

## 2026-09-19 — CR-078 — PostgreSQL backups + a restore actually verified

Summary: the next open Deployment-section ticket after CR-077/CR-079. Unlike
every other open Deployment ticket, this one didn't have to stay
documentation-only against an unreachable Docker daemon — this environment's
local Postgres (used since CR-004, outside Docker) is genuinely reachable, so
"a restore actually verified" (the ticket's own title, not just "a script
that looks right") was achievable live in this session.
Investigation: `docker-compose.prod.yml`/ADR-018 deliberately run no Postgres
service of their own — production hosting is undecided, `DATABASE_URL` is
assumed to already point at a real, externally provisioned instance. A
backup mechanism therefore can't assume a specific host or container; it has
to be connection-string-driven, the same shape `packages/db/src/migrate.ts`
already uses. No `docs/deployment.md` exists — `docs/database.md` already
owns `packages/db`'s operational rules (ADR-012's time rules live there), so
a new "Backups" section there is the natural home rather than inventing a
new doc.
Implementation: `packages/db/scripts/backup.sh` (`pg_dump --format=custom`
against `DATABASE_URL`, timestamped output file, `BACKUP_DIR`/
`BACKUP_RETENTION_DAYS`-configurable, default 7-day pruning) and
`packages/db/scripts/restore.sh` (`pg_restore --clean --if-exists
--no-owner --no-privileges`, one positional backup-file argument) — plain
shell, no new npm dependency, same "boring, explicit" precedent as
`migrate.ts`. New `packages/db/package.json` scripts `db:backup`/`db:restore`.
`docs/database.md` gained a "Backups" section: the mechanics above, an
explicit statement that backup _destination_ (local disk vs. offsite/S3
sync) is left to whoever operates the real Postgres instance — the same
reasoning ADR-018 already used for leaving that instance's host undecided —
plus a daily-cron scheduling example. `.gitignore` gained
`packages/db/backups/` (the scripts' default output directory; real backup
files are never repository content).
Decisions: none new at the ADR level — same "implementation, not an
architectural decision" precedent as CR-076/CR-077/CR-079. Backup
destination stays exactly as undecided as Postgres hosting itself (ADR-018),
deliberately not resolved here.
Validation — this is the part that matters for this ticket's own acceptance
criterion: inserted one marker row (`cr078-backup-verify@example.com`) into
the real local `coffee_ride_dev` database (the only non-empty table in an
otherwise-empty dev database, so the restore had real data to actually
carry, not just an empty schema); ran `pnpm --filter db db:backup`; created
a throwaway scratch database (`coffee_ride_cr078_restore_test`); restored
the produced `.dump` file into it via `restore.sh`; compared `count(*)`
across all 14 real tables between source and restored database — every one
matched exactly (13 at `0`, `users` at `1`); separately confirmed the marker
row's `id`/`email`/`display_name` were byte-identical between the two
databases, not just a matching count. Cleaned up afterward: deleted the
marker row from the real dev database, dropped the scratch database,
deleted the test backup file — nothing from this verification pass was left
behind. `pnpm turbo run lint typecheck build test` (via `--filter='!web'`,
`apps/web`'s build run separately with `NODE_ENV=production` — see Discovered
issues below): 25/25 tasks green, 299/299 `apps/api` tests passing (this
ticket touched no application source).
Discovered issues: none new — re-hit KI-038 (`next build` crashes under an
inherited `NODE_ENV=development` from sourcing the root `.env` into the same
shell as `apps/api`'s DB env vars), already documented with its exact
workaround; not a regression, confirmed by following that entry's own
"override NODE_ENV=production for the build command" workaround, which
worked cleanly.
Known limitations: none new. The restore was verified against this
environment's real local Postgres, not a fresh disaster-recovery scenario on
a from-scratch host — that's the same class of "verified locally, not
against the exact real deploy target" gap KI-043/KI-045 already record for
the Dockerfiles/production manifest, not a new one worth a separate entry.
Follow-up: CR-080 (CI gaps), CR-081 (full production env var set +
deployment documentation), CR-082 (pin MinIO/review base images) remain
open, no fixed order decided among them.

## 2026-09-19 — CR-080 — CI gaps: MinIO service, Playwright e2e job (KI-007)

Summary: the next open Deployment-section ticket after CR-078. KI-007 named
three gaps in `.github/workflows/ci.yml`: no MinIO service, no migration
step, no Playwright job. The migration-step complaint turned out to be
stale — `pnpm --filter db db:migrate` has been a real CI step since CR-011
(`git log` confirms); KI-007's text was simply never corrected after that
landed. The other two were real.
Investigation: `apps/web/src/app/page.tsx` (`/`) has been the real discovery
screen since CR-024, calling the real `GET /v1/rides` through `apps/web`'s
own `/api/v1/*` rewrite — not the CR-002 bootstrap placeholder
`apps/web/e2e/home.spec.ts` still asserted on ("Платформа собирается...",
copy that no longer exists anywhere in the app). Wiring that spec into CI
unmodified would have just added an immediately-failing check. This also
meant `apps/api` now has to be running for any e2e spec to work at all —
`playwright.config.ts`'s `webServer` only ever started `apps/web`.
`.claude/rules/testing.md` names three critical-journey specs (discover+
register, organizer create+publish, organizer view participants) that don't
exist yet — no ticket owned writing them; out of scope for "wire CI", so
opened as a new ticket (CR-092) rather than silently expanding scope or
leaving it untracked (same precedent as CR-088..091). Confirmed
`apps/api`'s existing S3 test suite (`route.routes.test.ts`) mocks
`@aws-sdk/client-s3` at the module level — no test anywhere hits a real
store, which is exactly what KI-015 has flagged as unverified since CR-006,
blocked every session so far by the local sandbox's unreachable Docker
daemon. A GitHub Actions runner has real Docker for service containers —
different environment, actually able to close that gap for the first time.
Implementation: `ci.yml` gained a `minio` service (`quay.io/minio/minio:
RELEASE.2025-09-07T16-13-09Z`, same pinned tag as `docker-compose.yml`), a
"Create MinIO bucket" step (`aws s3 mb` against it — `ubuntu-latest` ships
`aws-cli` preinstalled, no extra container/binary needed), `S3_*`/
`AUTH_SECRET`/`WEB_ORIGIN`/`RUN_LIVE_S3_TESTS` added to the job's `env:`
(the first two were never needed before — nothing booted a real `apps/api`
process in this job until now), a Playwright browser install step, and an
"E2E tests" step after Build. New `apps/api/src/modules/rides/
route-storage.live.test.ts`: a real, unmocked upload/download/delete round
trip through `route-storage.ts`'s exported functions. Gated on
`RUN_LIVE_S3_TESTS === '1'`, not merely "are `S3_*` set" — a local `.env`
has them configured for MinIO whether or not MinIO is actually running
(docker-compose.yml/.env.example's defaults), and this session hit exactly
that false positive: the first version of this gate (S3_*-presence only)
failed against this environment's real `.env` instead of skipping, since
Docker/MinIO aren't running here (KI-019). `apps/web/playwright.config.ts`'s
`webServer` became a two-entry array (Playwright's own supported
multi-server ordering since 1.34): `apps/api` first (`tsx src/server.ts`,
no `--watch`, waited on `/health`, env defaulted to the same local-dev
values `docker-compose.yml` uses so a developer needs nothing exported),
then `apps/web` unchanged — this is what makes `pnpm test:e2e` work
identically in CI and local dev without any CI-YAML-specific
background-process handling. `e2e/home.spec.ts` rewritten: asserts the real
page title and, deliberately not assuming an empty database (CI's is,
local dev's usually isn't after a while), accepts either the empty state or
at least one real ride card — proving the full round trip resolved instead
of hanging on the loading skeleton or falling into the error state.
Decisions: none new at the ADR level — same "implementation, not an
architectural decision" precedent as CR-076/077/078/079.
Validation — the part that matters here, since none of this can be proven
by an actual GitHub Actions run from this sandbox: ran `pnpm test:e2e`
locally for real, from a clean state (killed two stale dev-server processes
first — see Discovered issues) — the new two-webServer config started a
real `apps/api` and `apps/web` and the rewritten spec passed end to end
against this environment's real local Postgres, in ~12s total including
both servers' startup. Separately ran `route-storage.live.test.ts` twice:
once with no `RUN_LIVE_S3_TESTS` (this environment's normal state) —
skipped cleanly; once with it forced to `1` — genuinely attempted a real
connection and failed with `RouteStorageError` (no MinIO running here),
proving the gate itself discriminates correctly before trusting it to guard
CI's real run. `pnpm turbo run lint typecheck build test` (via
`--filter='!web'`, `apps/web` built separately per KI-038's own documented
workaround): 25/25 tasks green, 299 passed + 1 skipped `apps/api` tests
(the new live-S3 file, correctly skipped locally).
Discovered issues: found (and fixed, not just noted) a real self-inflicted
one while investigating why the rewritten e2e spec hung on the loading
skeleton against an already-running local dev server: CR-078's own earlier
`NODE_ENV=production pnpm --filter web build` in this same session had
overwritten `apps/web/.next` with production output, so the long-running
`next dev` process from before that (pid still listening on :3000) was
serving stale HTML referencing chunk paths that no longer existed on disk —
404s on every `_next/static/chunks/*` request, so React never hydrated and
the discovery fetch never ran. Killed both stale processes (`apps/api`'s
and `apps/web`'s) and re-ran clean; not a bug in this ticket's own changes,
but a real trap worth naming for any future session that runs a production
build and a dev server in the same working tree without restarting the
latter afterward.
Known limitations: KI-007 resolved (moved to Resolved section). The
MinIO-service/CI-job combination itself is unverified by an actual GitHub
Actions run (none available in this sandbox) — same category of gap as
KI-043/KI-045's Docker artifacts, not a new one. CR-092 (critical-journey
e2e specs) is new and open.
Follow-up: CR-081 (full production env var set + deployment documentation),
CR-082 (pin MinIO/review base images), and the new CR-092 (critical-journey
e2e specs) remain open, no fixed order decided among them.

## 2026-09-19 — CR-081 — Full production env var set + deployment documentation (KI-046)

Goal: close the remaining Deployment-section gap CR-080 left open —
`.env.example` completeness and an actual deployment procedure — plus
finish KI-046, which CR-079 only partially closed.

Investigation: cross-checked `.env.example` line by line against every
variable `docker-compose.prod.yml`'s `api`/`web`/`caddy` services actually
consume — already complete, nothing to add. The real gap was that no
`docs/deployment.md` existed at all: `docs/architecture.md`, ADR-018, and
`docker-compose.prod.yml`'s own comments each document one slice (reverse
proxy choice, migration profile) but nothing walked an operator through an
actual deploy end to end. Separately, KI-046 (`docker-compose.prod.yml`
substitutes an empty string, not an absent variable, for an unset optional
env var — confirmed by CR-079 via `docker compose ... config`) was only
fixed for `ERROR_REPORTING_WEBHOOK_URL`; `REDIS_URL`/`S3_ENDPOINT` still had
the bare, crash-on-empty-string `z.string().url().optional()` shape.

Implementation: `apps/api/src/env.ts` — applied the same `z.preprocess`
empty-string-to-`undefined` normalization already used for
`ERROR_REPORTING_WEBHOOK_URL` to `REDIS_URL` and `S3_ENDPOINT` (the only
other two `.url().optional()` fields; the remaining `S3_*` fields are plain
`z.string().optional()`, which already accepted `''` without crashing — no
change needed there). New `apps/api/src/env.test.ts` (didn't exist before):
covers the empty-string normalization for both fields, a genuinely malformed
URL still being rejected, a real URL still being accepted, and the existing
production-placeholder-refusal behavior — this correctness-critical parsing
logic now has direct test coverage instead of only ever being exercised
indirectly through other suites. New `docs/deployment.md`: prerequisites (a
Docker + Compose v2 host, DNS already pointed at `DOMAIN`, externally
provisioned Postgres/Redis/S3 — ADR-018 leaves that hosting choice open,
this doc doesn't invent one), preparing `.env`, first-boot order (`--profile
migrate run --rm migrate` before `up -d --build`, per CR-076), verification
(`/health`'s per-dependency semantics, Caddy TLS, pino/request-id logs),
redeploying, rollback limitations (no automated down-migrations — a
schema-incompatible rollback needs a manually written reverse migration),
and a pointer to `docs/database.md`'s Backups section rather than
duplicating it. States plainly, once, that none of this has been exercised
by a real `docker compose up` in any session (KI-043/KI-045) — documented
and reviewed, not live-verified.

Decisions: none new at the ADR level — an implementation fix (KI-046) plus a
documentation addition, same "not an architectural decision" precedent as
CR-076/077/078/079/080.

Validation: `apps/api/src/env.test.ts` — 6/6 new tests pass in isolation
(`vitest run src/env.test.ts`). Full monorepo check with a real local
`DATABASE_URL`: `pnpm turbo run lint typecheck build test --filter='!web'`
— 25/25 tasks green, 305 passed + 1 skipped `apps/api` tests (up from 299 —
the 6 new ones), no regressions. `apps/web` built separately
(`NODE_ENV=production pnpm --filter web build`, KI-038's documented
workaround): succeeded, all 17 routes. `docs/deployment.md` itself is
documentation, not code — reviewed against `docker-compose.prod.yml`/
`deploy/Caddyfile`/every referenced CR/ADR for accuracy, same "can't be
live-verified in this sandbox" caveat as the rest of the Deployment section.

Known limitations: KI-046 fully resolved (moved to reflect that in
`.claude/context/known-issues.md` — it was already filed under Resolved
despite its prior "open (partially mitigated)" status text, a pre-existing
filing quirk, not something this entry introduces). `docs/deployment.md`
carries the same standing "reviewed, not live-verified" caveat as every
other Deployment artifact (KI-043/KI-045) — restated explicitly in the doc
itself rather than left implicit.

Follow-up: CR-082 (pin MinIO/review base images) is the one remaining
Deployment-section ticket. CR-092 (critical-journey e2e specs) and CR-083
(registration idempotency) remain open, tracked separately, no fixed order
decided among the three.

## 2026-09-19 — CR-082 — Fix Dependabot docker/docker-compose coverage (base image review)

Goal: close the last open Deployment-section ticket — pin `minio/minio` to
a release tag (already done) and review base image versions.

Investigation: grepped the whole repo for `minio/minio`/`:latest` —
`docker-compose.yml` and `.github/workflows/ci.yml` already pin MinIO to
`quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`, landed in CR-009
(2026-09-13). Same "ticket text already stale" shape as CR-080's
migration-step third. The real question was how the remaining floating
base-image tags (`node:24-alpine` in all three Dockerfiles,
`postgres:17-alpine`/`redis:8-alpine` in `docker-compose.yml`,
`caddy:2-alpine` in `docker-compose.prod.yml`) actually get reviewed over
time — checked `.github/dependabot.yml`'s one `docker` entry
(`directory: '/'`) against GitHub's own docs and current Dependabot
behavior (WebFetch + WebSearch, since this is real external tooling
behavior, not project-internal state). Found two real, previously
undiscovered gaps: (1) `docker` and `docker-compose` are separate
Dependabot ecosystems (the latter reached GA February 2025) — no
`docker-compose` entry existed anywhere in this repo's config, so
`docker-compose.yml`/`docker-compose.prod.yml`'s `image:` references
(postgres/redis/minio/caddy) have never been covered by any Dependabot
update, ever. (2) The `docker` ecosystem only scans the exact `directory`
given, with no subdirectory recursion — this repo has no Dockerfile at the
repo root at all (all three live nested under `apps/web`, `apps/api`,
`packages/db`), so the existing `directory: '/'` entry has never actually
scanned any of them either. Net effect: nothing that sets a base-image
version anywhere in this repo has ever actually been reviewed by
Dependabot, despite `dependabot.yml` appearing to include a working
`docker` entry.

Implementation: `.github/dependabot.yml` — replaced the one non-functional
`docker` entry with three `docker` entries, one per real Dockerfile
directory (`/apps/web`, `/apps/api`, `/packages/db`), plus a new
`docker-compose` entry (`directory: '/'`) covering both compose files. Same
weekly schedule as every other ecosystem already configured. No base image
version changes — `node:24-alpine`/`postgres:17-alpine`/`redis:8-alpine`/
`caddy:2-alpine` stay intentional major/minor floating tags (not
`:latest`, not digest-pinned); Dependabot, now actually wired to reach
every one of them, is the ongoing review mechanism rather than a one-time
manual audit that would go stale again immediately. MinIO remains the one
deliberate exception (an exact `RELEASE.*` tag) since it doesn't publish a
rolling major-version tag the way the others do.

Decisions: none new at the ADR level — a tooling-config fix, same "not an
architectural decision" precedent as CR-076/077/078/079/080/081.

Validation: `.github/dependabot.yml` parsed with `python3 -c "import
yaml..."` — valid YAML, all 6 entries present with the expected
ecosystem/directory pairs. Cannot be proven by an actual Dependabot run
from this sandbox (same "GitHub-hosted automation, reviewed not
live-verified" category as CI changes in CR-080) — the next scheduled
Dependabot run against the real repo is what actually confirms this.

Known limitations: none new. This closes the Deployment section of
`docs/tasks.md` entirely (CR-074 through CR-082, all now checked off).

Follow-up: CR-092 (critical-journey e2e specs) and CR-083 (registration
idempotency) remain open, no fixed order decided between them.

## 2026-09-19 — CR-083 — Idempotency for register/waitlist-join (network retries)

Goal: "the DB constraint is the backstop, not the design" — a network retry
of an already-successful `POST /v1/rides/:id/register` (or the waitlist
equivalent) must not surface as an error.

Investigation: `registrations.service.ts`'s `createRegistration` already
atomically prevents a second row (`SELECT ... FOR UPDATE` row lock +
`existingActive` check + the DB-level partial unique index backstop,
CR-034/035) — that invariant was correct and untouched. The real gap was
client-facing: when a retry of the exact same (rideId, userId) register
call landed after the first one already committed, the caller got back
`409 registration_already_exists` — indistinguishable from "you tried to
double-register." `joinWaitlist` has the identical shape for its own
`existingWaiting` check (`409 waitlist_entry_already_exists`). Read
`apps/web/src/features/participant/ride-detail/components/
RegistrationButton.tsx`: its `isPending` guard only stops a second _click_
while a request is in flight — it does nothing for a genuine network-level
retry where the original request actually succeeded but the response never
reached the client, which today shows the user a generic error despite
them actually being registered. Confirmed `joinWaitlist` has two different
"already" checks that needed different treatment: `existingActive` (caller
already has an active registration — a genuine conflict, "register/cancel
instead," not a retry of the waitlist-join call) must stay a `409
registration_already_exists` error; only `existingWaiting` (the literal
same action being retried) is the idempotency case. Also confirmed
`apps/web`'s `registerForRide`/`joinRideWaitlist` clients branch on
`response.ok` (any 2xx), not the exact status code — so this fix needs zero
frontend changes and, as a side effect, fixes `RegistrationButton`'s latent
retry-shows-an-error bug for free.

Implementation: `createRegistration` and `joinWaitlist` now return
`{ registration | waitlistEntry, created: boolean }`. When the
already-exists branch is hit, the existing row is returned with
`created: false` instead of throwing — same lock, same read, different
outcome on the branch that used to error. `createRegistration`'s
`registration_confirmed` notification now only fires when `created` is
`true` (a retry must not fan out a second notification for an action that
already notified once). `registrations.routes.ts`'s two `POST` handlers
reply `201` when `created`, `200` on an idempotent replay — both added to
each route's Zod response schema. The unrelated `existingActive` check
inside `joinWaitlist` (registered-and-trying-to-join-the-waitlist-too) is
untouched, still throws `REGISTRATION_ALREADY_EXISTS()`. The now-unused
`WAITLIST_ENTRY_ALREADY_EXISTS` error factory was removed.
`docs/api.md`: documents the `200`-on-idempotent-replay behavior for both
endpoints; removed the now-impossible `409 registration_already_exists`
outcome from `POST .../register`'s own paragraph (it only ever applied to
`POST .../waitlist`'s cross-resource conflict now).

Decisions: none new at the ADR level — a behavior-only fix inside the
existing transaction/lock structure; `.claude/rules/database.md`'s
invariants are unchanged (still exactly one row per ride+user, still
enforced by the same lock + unique index).

Validation: rewrote the two tests whose asserted behavior actually changed
(`registrations.routes.test.ts`) into idempotency tests — a repeat register
call returns `200` with the _same_ registration id, `GET /v1/rides/:id`
still shows `registrationsCount: 1`, and `GET /v1/notifications/mine` shows
exactly one `registration_confirmed` entry (not two); a repeat waitlist-join
call returns `200` with the same entry id and the organizer's `GET
/v1/rides/:id/waitlist` still shows exactly one item. The two tests
covering the _unrelated_, still-an-error `existingActive`-inside-
`joinWaitlist` conflict were left unchanged and still pass. Full suite:
`pnpm turbo run lint typecheck build test --filter='!web'` — 25/25 tasks
green, 305 passed + 1 skipped (same total as before CR-083 — two tests were
rewritten in place, not added). `apps/web` untouched, no rebuild needed.

Known limitations: none new.

Follow-up: CR-092 (critical-journey e2e specs) is the one remaining open
ticket with no dependency on anything blocked in this environment.

## 2026-09-19 — CR-092 — Real critical-journey Playwright specs

Goal: write the three e2e journeys `.claude/rules/testing.md` names
(participant discovers+registers; organizer creates+publishes a ride;
organizer views participants) — `home.spec.ts` is a one-page smoke check,
not this; CR-080 only wired the suite into CI.

Implementation: new `apps/web/e2e/helpers/api-fixtures.ts`
(`registerAndVerify`/`login`/`createOrganizerProfile`/`createPublishedRide`/
`registerForRide`/`setDisplayName`, all direct `/api/v1/...` calls with the
CSRF `Origin` header a real browser fetch sends automatically but
Playwright's `APIRequestContext` does not) and new
`apps/web/e2e/critical-journeys.spec.ts` with the three journeys. Each spec
seeds only its own preconditions via API (no UI verify-email screen exists
anyway, KI-026) and drives the actually-tested journey through real UI
interaction — form fills, button clicks, rendered-state assertions — not a
second API script pretending to be a UI test. `test.describe.configure({
mode: 'serial' })` groups all three in one file: `/v1/auth/register` and
`/v1/auth/login` each carry their own 5/min/IP in-memory rate limit
(KI-014's interim tier), and the three journeys together need exactly 5 of
each — spec 3 reuses `page.request`'s already-logged-in organizer cookie
jar instead of a redundant second UI login, which is what keeps the total
at 5 instead of 6.

Two real bugs found and fixed while writing these (not pre-existing
regressions — surfaced by actually running the specs, not assumed):
`loginViaUi`'s original version clicked the login submit button and
immediately called `page.goto(...)`, racing `LoginForm`'s own
`await login(...)` — the goto's hard navigation could cancel that in-flight
fetch before the session cookie was ever set. Fixed by waiting for the
post-login `router.replace('/me')` navigation (`page.waitForURL('/me')`)
before proceeding. Also added `assertOk()` to every fixture helper — the
first version let a failed setup call (e.g. rate-limited) surface as a
confusing `Cannot read properties of undefined` several calls downstream
instead of a clear error at the actual failure point.

Decisions: none new at the ADR level — test-suite work, not an
architectural decision.

Validation: `pnpm --filter web typecheck`/`lint`: clean. `pnpm turbo run
test:e2e`: 4/4 passing (`home.spec.ts` unchanged + the 3 new journeys), run
twice to confirm no flakiness once outside the rate-limit collision window
(a single back-to-back manual rerun within the same ~60s did trip the
shared login/register limit once during development — expected given 5 of
each per run, not a bug; a single real CI run only executes the suite
once). Full `pnpm turbo run lint typecheck build test` (real local
`DATABASE_URL`): 29/29 tasks green — also cleared an unrelated stale
`apps/web/.next/types` artifact from an earlier session's production build
that was making `web#typecheck` fail on files that no longer existed; not
caused by this ticket's changes, `rm -rf apps/web/.next` was the fix (Next
regenerates it on the next `dev`/`build`/`typecheck` run).

Known limitations: none new. This was the one remaining open ticket with no
dependency on anything unavailable in this environment (Docker/Redis/S3/
2GIS all still as documented in `.claude/context/known-issues.md`).

Follow-up: none currently queued — every ticket in `docs/tasks.md` is
either checked off or explicitly blocked (CR-058 on KI-014/live Redis).

## 2026-09-19 — CR-093 — Connect live 2GIS Geocoder/Directions key (resolve KI-016)

Goal: the user supplied a real 2GIS API key ("подключи карту 2gis по api").
2GIS credentials are split into two unrelated products (CR-071):
`NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` (public, browser map rendering) and
`MAPS_2GIS_API_KEY` (private, server-side Geocoder/Directions, billed per
request). Asked the user which product the supplied key was issued for
rather than guessing — confirmed it is the server-side Geocoder/Directions
key.

Implementation: added the key to local `.env` (`MAPS_2GIS_API_KEY`, already
`.gitignore`d — never touched `.env.example`, which stays a blank
template). Wrote a throwaway script (`packages/maps-2gis/live-check.ts`,
deleted after use, never committed) calling `create2GisMapProvider`
directly against the real 2GIS API — exactly KI-016's documented "next
action" now that a credential exists: a geocode of "Красная площадь,
Москва", a reverse-geocode, and a cycling route from Red Square to Gorky
Park.

Findings: `geocode`/`reverseGeocode`'s field-name guesses
(`point.lat`/`point.lon`, `full_name`) were exactly right — both returned
correct, sensible results immediately. `getRoute`'s `total_distance`/
`total_duration` guess was also right, but its geometry guess was wrong and
had been silently falling back to the two requested waypoints on every
call: dumped the raw routing response
(`packages/maps-2gis/raw-check.ts`/`dump.ts`, also deleted after use) and
found the real polyline lives in `maneuvers[].outcoming_path.geometry[]`,
each entry a WKT `LINESTRING(lon lat, lon lat, ...)` string — not the flat
`{lat, lon}` array `route.ts` assumed. Fixed in
`packages/maps-2gis/src/route.ts`: new `parseWktLineString` helper, rewrote
`extractGeometry` to flatten every maneuver's WKT segments instead of
looking for a top-level `geometry` field that never existed.
`provider.test.ts`'s route-geometry fixture updated to the verified real
response shape (`maneuvers[].outcoming_path.geometry[].selection`) instead
of the old invented one. Re-ran the live script after the fix and confirmed
a real multi-point road-following polyline now comes back instead of the
two-point fallback.

Decisions: none new at the ADR level — this verifies and fixes an existing
adapter (ADR-010) against its real dependency; it does not change the
architecture. No new consumer was wired in — `create2GisMapProvider` still
has zero callers in `apps/api`/`apps/web` (KI-017's "factory exists, no
consumer until one is justified" discipline stays true); that remains
follow-up work (KI-032, CR-028/CR-084), not part of this ticket's scope.

Validation: `pnpm --filter maps-2gis test` (11/11 passing),
`pnpm --filter maps-2gis typecheck`, `pnpm --filter maps-2gis lint`, and
`pnpm --filter maps-2gis... build` (maps-core/resilience/maps-2gis) all
green. Live-verified directly against the real 2GIS Geocoder and Routing
APIs (not just unit-tested against fixtures) — see Findings above.

Known limitations: `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` (the separate public
browser-rendering key) still does not exist anywhere in this environment,
so KI-031 (no live MapGL rendering; every map surface shows a degraded
placeholder) is unchanged and unresolved by this ticket. `create2GisMapProvider`
still has no real caller.

Known issues resolved: KI-016 (2GIS Geocoder/Routing response parsing
unverified against a live API) — see
`.claude/context/known-issues.md`.

Follow-up: wire an actual consumer now that geocoding is live-verified —
either KI-032 (geocode-by-address UI in `EditRideForm`) or CR-028/CR-084's
route rendering. Separately, if/when a public MapGL key is provided, KI-031
becomes actionable (build the render-layer type in `packages/maps-core` +
`packages/maps-2gis`'s MapGL implementation).

## 2026-09-19 — CR-058 — Redis-backed, per-IP-and-per-account auth rate limiting

Goal: `docs/tasks.md`'s last unblocked backlog item besides CR-086. CR-011
shipped an interim in-memory, per-IP-only tier on auth endpoints; this
ticket is the Redis-backed, per-account upgrade `.claude/rules/security.md`
names, blocked on KI-014 ("Redis unverified in this environment") since
CR-011. This session found Docker up and both `redis`/`minio` containers
already healthy (started by a prior session ~35 minutes earlier) — took the
opportunity instead of waiting for another one.

Implementation: `apps/api/src/app.ts`'s global `@fastify/rate-limit`
registration now passes `app.redis` into the plugin's own `redis` option
(its built-in `RedisStore`, atomic Lua `INCR`+`PEXPIRE`) whenever
`REDIS_URL` is configured — shared across instances instead of each process
counting independently — and falls back to the plugin's in-memory store
otherwise, unchanged from before. Added `skipOnError: true` globally (not
just for auth): a degraded Redis must never turn into a false `429` blocking
a critical journey (`.claude/rules/resilience.md`), only cost the
shared-counter protection.

Per-account tier is new and independent of the per-IP one (two separate
gates, not a combined key — `.claude/rules/security.md`: "per IP and per
account"). `@fastify/rate-limit` v11.2.0 has no supported way to stack a
second, independently-keyed limit on one route (confirmed by reading its
source: one `config.rateLimit` object per route, no array support), so this
is a small new helper (`apps/api/src/lib/account-rate-limit.ts`) using
`MULTI INCR + PEXPIRE key windowMs NX EXEC` — atomic, no Lua needed (Redis
7+'s `PEXPIRE ... NX` sets the TTL only on the window's first hit, the same
semantics the library's own script implements), bounded by the existing
`raceTimeout` helper (ioredis commands accept no `AbortSignal`). Wired as a
`preHandler` on `/register`/`/login`/`/forgot-password` only — the three
endpoints `.claude/rules/security.md` names, keyed by the normalized email
already produced by each route's Zod schema. `/verify-email`/`/reset-password`
are untouched: they operate on opaque single-use tokens, not an
account identifiable from the request body. A 429 throws the existing
`AuthServiceError` convention, so it flows through the unchanged RFC 9457
error handler. Both tiers fail OPEN on a Redis error/timeout/absence, never
closed — login/register are critical journeys.

Testing: `apps/api/src/lib/account-rate-limit.test.ts` (new, 6 tests) —
mocked Redis, covers not-configured/under-threshold/over-threshold/
first-hit-TTL/error-fails-open/null-exec-fails-open. `auth.routes.test.ts`
gained a new describe block, live against the real Redis this session had
running (`it.skipIf` when `REDIS_URL` isn't set — CI's job env sets it
unconditionally, so it isn't a local-only check): confirms `buildApp()`
boots and rate-limits correctly end to end with a real `REDIS_URL` wired all
the way through, plus a `/health` check confirming `redis: "ok"`. Its
`beforeEach` flushes the `fastify-rate-limit-*`/`auth-rl:account:*` key
namespaces first — real external Redis state persists across separate test
runs (unlike the in-memory store every other test in the file uses), and a
first version of this test was flaky against leftover state from a prior
run within the same 60s TTL window before this fix.

Found and fixed one real regression along the way: `routes/health.test.ts`'s
mocked `ioredis` client lacked `defineCommand`, which `RedisStore`'s
constructor now calls unconditionally on any non-null `app.redis` (previously
never invoked, since nothing passed `app.redis` into `@fastify/rate-limit`
before this ticket) — crashed at boot with `this.redis.defineCommand is not
a function`. Fixed by predefining `rateLimit`/`rateLimitRead` directly on
the mock (`RedisStore`'s constructor skips `defineCommand` entirely when
those already exist) rather than faking `defineCommand`'s dynamic-command
machinery for a suite that has nothing to do with rate limiting.

Live verification beyond the test suite: stopped the real `redis` container
mid-session (`docker compose stop redis`) and, via a throwaway script
(`buildApp()` + `.inject()`, deleted after use), confirmed `POST
/v1/auth/login` still replied `401` in ~1.3s — not hung, not `500` — proving
the fail-open claim above is real, not just reasoned about. Restarted Redis
and re-ran the full `apps/api` suite twice to confirm no lingering state
issues (313 passed, 1 skipped both times). `pnpm turbo run lint typecheck
build`: 24/24 green. `pnpm turbo run test`: 5/5 packages green.

Incidental finding (not fixed here, out of this ticket's scope): while
timing that fail-open check, `app.close()` itself resolved in the expected
~3s, but the Node process never exited on its own afterward — traced to
`apps/api/src/server.ts` never registering a `SIGTERM`/`SIGINT` handler at
all, so `modules/notifications/queue.ts`'s `onClose` hook (which assumes a
real graceful shutdown triggers it) never runs on a real `docker stop`.
Recorded as KI-048, new ticket CR-094.

Decisions: none new at the ADR level. No behavior change when `REDIS_URL`
is unset — every pre-existing test using the plain `testEnv` (no Redis)
passes unmodified.

Known issues resolved: KI-022 (auth endpoints' rate-limiting gap against
`.claude/rules/security.md`'s full checklist) — moved to
`.claude/context/known-issues.md`'s Resolved section.

Known issues discovered: KI-048 (no `SIGTERM`/`SIGINT` handler calls
`app.close()` — no real graceful shutdown exists), new ticket CR-094.

Follow-up: CR-094 (wire graceful shutdown). CR-086 (cover image pipeline)
is now the only unchecked, unblocked ticket left in `docs/tasks.md`.

## 2026-09-19 — CR-094 — Wire SIGTERM/SIGINT graceful shutdown (resolve KI-048)

Closed the gap CR-058 found: nothing in `apps/api/src/server.ts` ever
registered a `SIGTERM`/`SIGINT` handler, so `app.close()` — and therefore
every `onClose` hook (`modules/notifications/queue.ts`'s worker/producer
disconnect, `plugins/db.ts`'s Postgres pool close) — never ran on a real
`docker stop`/orchestrator shutdown.

New `apps/api/src/lib/graceful-shutdown.ts` (`registerGracefulShutdown`),
called from `server.ts` right after `buildApp()`, before `app.listen()`.
First `SIGTERM`/`SIGINT` logs, starts an unref'd 10s hard-fallback timer,
and calls `app.close()`: success clears the timer and `process.exit(0)`s,
a rejecting `close()` (an `onClose` hook throwing) logs and `exit(1)`s, and
the 10s timeout itself forces `exit(1)` if `close()` never settles — defense
in depth beyond `queue.ts`'s own bounded (3s) `onClose` hook, since
`db.ts`'s pool `.end()` has no timeout of its own. A second signal arriving
while a shutdown is already in flight forces an immediate `exit(1)` instead
of waiting on (or re-triggering) a possibly-stuck close.

Both the signal source (`process`) and the exit function are injected
dependencies, defaulting to the real `process`/`process.exit` in
production — the same DI shape `lib/account-rate-limit.ts` uses for Redis —
so the module is unit-tested (`lib/graceful-shutdown.test.ts`, 5 tests:
registration, clean shutdown, a rejecting `close()`, the force-exit
timeout via `vi.useFakeTimers()`, and the double-signal case) without
sending a real OS signal or killing the test process. Real signal delivery
against a running container still can't be live-verified in this sandbox
(KI-019, Docker daemon unreachable) — same limitation every prior
Redis/S3/Docker-dependent ticket here has hit; recorded as the residual gap
in KI-048's resolution note rather than left implicit.

Testing: `pnpm --filter api exec vitest run src/lib/graceful-shutdown.test.ts`
5/5 passed. `pnpm --filter api typecheck`/`eslint .`: clean (typecheck
caught one real issue while writing the test — `Pick<NodeJS.Process, 'on'>`
requires `on()`'s return type to be `Process`, so the fake needed a type
assertion rather than a plain object literal). `pnpm --filter api test`:
55 passed, 1 skipped, 12 failed — every failure a pre-existing
`DATABASE_URL is required` guard in an unrelated DB-dependent suite
(KI-014/KI-019, no live Postgres in this sandbox), none touching this
change. `pnpm turbo run lint typecheck build`: 24/24 green.

Decisions: none new at the ADR level.

Known issues resolved: KI-048 (no `SIGTERM`/`SIGINT` handler calls
`app.close()`) — moved to `.claude/context/known-issues.md`'s Resolved
section.

Follow-up: CR-086 (cover image pipeline) is now the only unchecked,
unblocked ticket left in `docs/tasks.md`.

## 2026-09-20 — CR-095 — Test-suite data-loss guard + backup safety net (KI-049)

Problem: the previous session ran `apps/api`'s test suite with `.env` sourced
into the shell to populate `DATABASE_URL`. `.env`'s `DATABASE_URL`
deliberately points at the real native Homebrew Postgres (`coffee_ride_dev`,
real accumulated manual-QA data), not a disposable test database — but every
`apps/api/src/modules/**/*.routes.test.ts` file's `beforeEach`/`afterAll`
runs an unscoped `DELETE FROM rides`/`DELETE FROM users` (cascading via FK to
most of the schema) against whatever `DATABASE_URL` is in the environment.
The suite ran clean and wiped the real database as a side effect. User
confirmed the lost data was disposable test/QA data and does not need
restoring; this session's job was making the class of incident impossible
going forward, and giving a real restore point for whatever real data exists
from here on.

Root cause fix: `apps/api/src/test-support/test-database-url.ts`
(`getTestDatabaseUrl`) — every one of the 13 `apps/api` test files that
touches a real Postgres now reads `TEST_DATABASE_URL`, a variable `.env`
never sets at all, instead of `DATABASE_URL`. Sourcing `.env` for any reason
can therefore no longer feed the suite a real database — not a documented
workaround to remember, a structural change. Second, independent layer:
even a correctly-set `TEST_DATABASE_URL` is refused unless its database name
looks disposable (contains "test", or is exactly "coffee_ride") — guards
against a wrong value (e.g. copy-pasted from `DATABASE_URL`), not just
against `.env` itself. Live-verified this refuses `coffee_ride_dev` by name
with a clear error, not a silent pass-through.

`.env.example`/`.env`/`.github/workflows/ci.yml` all set `TEST_DATABASE_URL`.
CI's points at the same disposable per-run Postgres service container it
already used for `DATABASE_URL` (no behavior change there, just an explicit,
independent variable). Local `.env`'s value uses `127.0.0.1` explicitly,
not `localhost` — this machine runs both a native Postgres (`DATABASE_URL`,
`[::1]:5432`) and Docker Compose's Postgres (`TEST_DATABASE_URL`,
`127.0.0.1:5432`) at once, and relying on `localhost`'s address-family
resolution order to keep them apart is exactly the kind of ambiguity that
let this incident happen unnoticed.

Live-verified end to end, not just reasoned about: migrated the previously
empty Docker Compose `coffee_ride` database (`pnpm --filter db db:migrate`
against it), recorded `coffee_ride_dev`'s user count (2), sourced `.env`
(the exact scenario that caused the incident), ran `pnpm --filter api test`
— 345 passed, 1 skipped — then re-checked `coffee_ride_dev`'s user count:
still 2, unchanged. `pnpm --filter api typecheck`/`lint`: clean.

Backup side of the same incident: KI-049 also found there was no backup to
restore from — `packages/db/scripts/backup.sh` has existed since CR-078 but
had never actually been run anywhere, local or prod, and `docs/database.md`
only ever documented a cron one-liner nobody had installed. Took an
immediate real backup of `coffee_ride_dev` into `packages/db/backups/`
(gitignored) as an immediate safety net. `docker-compose.prod.yml` gained a
`backup` service that runs `backup.sh` automatically on `docker compose up`
— deliberately not gated behind a `migrate`-style profile, since a backup is
read-only against the database and therefore safe to always run — taking an
immediate backup on start and repeating every `BACKUP_INTERVAL_SECONDS`
(default 86400s/daily) into a new `postgres_backups` named volume; a failed
run logs and retries next interval instead of crash-looping. Validated with
`docker compose -f docker-compose.prod.yml config` — caught and fixed a real
bug in the process: an unescaped `$BACKUP_INTERVAL_SECONDS` inside the
service's shell `command:` was being interpolated by Compose itself at
config-render time (to an empty string) instead of passed through to the
container's own shell; fixed with `$$BACKUP_INTERVAL_SECONDS`, confirmed the
escaped form survives `docker compose config` unresolved as intended.
`docs/database.md`'s Backups section rewritten to describe this automatic
schedule instead of the old "add a cron entry yourself" instructions, and to
note local dev intentionally has no equivalent — a local database is now
meant to be disposable by construction (this task's own fix).

Testing: `pnpm --filter api test` (345 passed/1 skipped, against the now
correctly TEST_DATABASE_URL-isolated suite), `pnpm --filter api
typecheck`/`lint` clean, `docker compose -f docker-compose.prod.yml config`
clean (including the `$$` fix).

Decisions: none new at the ADR level — this operationalizes CR-078's
existing backup mechanism and KI-049's own already-scoped next action,
neither a new architectural decision.

Known issues resolved: KI-049 (test suite wiped real dev data) — moved to
`.claude/context/known-issues.md`'s Resolved section.

Follow-up: CR-086 (cover image pipeline) remains the only unchecked,
unblocked ticket in `docs/tasks.md` — its files are already in the working
tree from an earlier session (implemented, uncommitted) but were not
touched by this task.

## 2026-09-20 — CR-086 — Cover image pipeline (ADR-019)

`rides.coverImageUrl` had existed as a nullable column since CR-017 with no
way to ever set it (KI-023). This ticket's code was fully implemented in an
earlier session but left uncommitted, and its docs half (`docs/api.md`,
`docs/database.md`) was never finished — both completed this session before
committing.

ADR-019 decisions: accepted types are JPEG/PNG/WebP, verified by actually
decoding the file with `sharp` rather than trusting the client
`Content-Type` (SVG explicitly excluded — script-in-SVG XSS risk); 8 MB
upload cap via `@fastify/multipart`'s per-call `limits.fileSize`; resize to
1920×1920 max (`fit: 'inside'`, no upscaling), `.rotate()` to bake in EXIF
orientation, then remaining metadata stripped (incidental privacy win —
phone photos often carry GPS EXIF), original format preserved rather than a
forced re-encode; served via an API proxy (`GET /v1/rides/:id/cover`), never
a direct S3 URL, keeping the bucket fully private and needing no
`next.config.ts` `images.remotePatterns` entry. `rides.cover_image_url`
(text, never populated) renamed to `cover_image_key` (S3 key, matching
`routes.gpx_file_key`'s convention) plus new
`cover_image_content_type`/`cover_image_size_bytes` columns — the public API
field name `coverImageUrl` is unchanged, now computed from the key at
response time. Scope: `Ride` only, matching the literal ticket wording — the
validate/resize/storage modules (`apps/api/src/modules/rides/cover-image.ts`,
`cover-image-storage.ts`) are written generic enough to reuse for `User`/
`OrganizerProfile` avatars (KI-023's other two entities, still open).

API: `POST`/`PATCH`/`DELETE`/`GET /v1/rides/:id/cover`, same
auth/ownership/draft-only gate as `.../route` for the three mutations, same
viewer-visibility rule as `.../route/download` for `GET`. Error codes: `400
cover_image_missing`/`cover_image_too_large`/`cover_image_invalid`, `409
cover_image_already_exists`, `404 cover_image_not_found`, `503
cover_storage_unavailable`.

Frontend: `/organizer/rides/[id]/cover` (new feature module,
`apps/web/src/features/organizer/cover-image/`), linked from
`EditRideForm` next to the route/participants/updates links.
`RideCard`/`RideDetailView`'s `next/image` branches (already built in CR-048,
previously always inert since `coverImageUrl` was always `null`) go live.

Testing/validation (this session): `pnpm --filter api typecheck`/`lint` and
`pnpm --filter web typecheck`/`lint` clean. `pnpm --filter api test`: 345
passed, 1 skipped, including 27/27 new cover-image tests (resize/validate
helper unit tests, service-layer tests with `@aws-sdk/client-s3` mocked,
route auth/ownership/validation tests). `pnpm --filter web test`: 185
passed, including the new frontend form test. `pnpm turbo run build`: clean,
`/organizer/rides/[id]/cover` compiles as a real route. Live-verified
against the real running MinIO (Docker up this session) — not just mocked-S3
unit tests: registered a user, created a draft ride, uploaded a 400×300
JPEG (`201`, ride's `coverImageUrl` field went from `null` to real), an
unauthenticated `GET .../cover` on the still-draft ride correctly `404`s
(same visibility rule as route download — confirmed this wasn't a bug by
re-requesting as the owner, which returned the actual bytes decoding as a
real 400×300 JPEG), replaced it with a 3000×2000 image and confirmed the
resize bound by downloading it back as exactly 1920×1280, deleted it and
confirmed both the `204`/`coverImageUrl: null` response and a subsequent
`404`. Both the previously-empty Docker Compose `coffee_ride` database and
the real native `coffee_ride_dev` were migrated with the two new migrations
this ticket added (`0014_tense_revanche.sql`, `0015_high_owl.sql`) before
running any of this. All live-verification test data (the one ride/
organizer profile/user created for this check) was cleaned up from the real
`coffee_ride_dev` database afterward — confirmed the real user count was
unchanged before and after.

Decisions: ADR-019 (new) — see `docs/decisions.md`.

Known issues resolved: KI-023's `Ride` third is resolved (the entry stays
open for `User`/`OrganizerProfile` avatars, which reuse the same modules
when built).

Follow-up: `docs/tasks.md` has no other unchecked, unblocked ticket right
now. Next candidates: an avatar endpoint for `User`/`OrganizerProfile`
(KI-023's remainder, no ticket number yet), or wiring a real consumer for
`packages/maps-2gis` (KI-032's geocode-by-address UI, or CR-028/CR-084's
route rendering — both still zero-consumer per KI-016's resolution note).

## 2026-09-20 — CR-097 — User/OrganizerProfile avatars (resolve KI-023)

KI-023's remainder: real avatar upload/replace/delete/download for `User` and
`OrganizerProfile`, reusing CR-086/ADR-019's generic image pipeline exactly as
that ADR's point 7 anticipated, rather than building a third one.

Relocation (prerequisite): CR-086's `cover-image.ts`/`cover-image-storage.ts`
lived inside `modules/rides/`. `modules/rides`, `modules/users`, and
`modules/organizers` are three separate capability modules
(`.claude/rules/architecture.md`), so `users`/`organizers` importing a
`rides`-owned file directly would be the "reach into another module's
internals" `.claude/rules/resilience.md` warns against. Moved both files to
`apps/api/src/lib/image-processing.ts`/`image-storage.ts` with generic names
(`processImage`, `ImageInvalidError`, `ImageStorageError`,
`uploadImageObject`/`downloadImageObject`/`deleteImageObject`) — same
behavior, same single shared S3 circuit breaker, `rides.service.ts`'s import
updated, its own tests re-verified passing unchanged. Also extracted a small
`lib/read-upload.ts` (`readUploadedFile`/`UploadTooLargeError`) for the two
new avatar route files' multipart-read boilerplate; `rides.routes.ts`'s
existing GPX/cover-image copies were deliberately left alone (lower risk than
touching an already-shipped path for this ticket).

DB: `users`/`organizer_profiles` each gained nullable `avatar_key`/
`avatar_content_type`/`avatar_size_bytes` columns (same shape as
`rides.cover_image_*`) plus a non-negative-size CHECK constraint, migration
`0016_avatar_columns.sql`.

API: `POST`/`PATCH`/`DELETE`/`GET /v1/users/me/avatar` — fully "me"-scoped
(matches this module's existing "no `GET /v1/users/:id`" posture; no `:id`
variant exists). `POST`/`PATCH`/`DELETE /v1/organizers/me/avatar` ("me"-scoped
mutations) plus a public, no-auth `GET /v1/organizers/:id/avatar` — an
`OrganizerProfile`'s identity (including a photo) is already public via
`RideOrganizerSummary`, so unlike a ride's draft-gated cover there is no
viewer-visibility branch to write. Same error codes/shape as the ride cover
image (`avatar_missing`/`avatar_invalid`/`avatar_too_large`/
`avatar_already_exists`/`avatar_not_found`/`avatar_storage_unavailable`).
`RideOrganizerSummary`/`OrganizerProfile`/`User` all gained an additive
`avatarUrl` field (`.claude/rules/extensibility.md`: additive contract
change); `rides.service.ts` and `registrations.service.ts` both compute it by
importing `organizerAvatarUrlPath` from `organizers.service.ts` — the same
cross-capability-module reuse precedent those two files already had for
`reviews.service.ts`'s `getOrganizerRatingSummary(ies)`.

Frontend: `packages/ui` gained its first real `Avatar` component (named in
`docs/design.md` §9's inventory since CR-063, never built until now — image
with initials/silhouette fallback, framework-neutral plain `<img>`) plus a
shared `AVATAR_TERMS`. Upload UI (`AvatarUploadForm`, same 3-verb shape as
`CoverImageUploadForm` minus a draft gate — an avatar has no draft state)
duplicated once per cabinet (`features/participant/profile/`,
`features/organizer/profile/`) rather than shared — not in design.md's fixed
shared-component inventory, and this repo already keeps near-identical
GPX/cover-image upload UI feature-local rather than force an abstraction.
Wired into `/me/profile` (`ProfileForm`'s existing screen) and
`/organizer/profile` (only once an `OrganizerProfile` exists, since the API
requires one to upload against).

Testing/validation (this session): `pnpm --filter api typecheck`/`lint`,
`pnpm --filter web typecheck`/`lint`, `pnpm --filter ui typecheck`/`lint`,
`pnpm --filter db typecheck`/`lint`, `pnpm --filter types typecheck`/`lint`
all clean. `pnpm turbo build` clean across all 9 packages. `pnpm --filter
api test` (against the real disposable `TEST_DATABASE_URL` Postgres,
migrated with the new migration first): 369 passed, 1 skipped (the
opt-in live-S3 test), including 24 new avatar route tests (14 user, 10
organizer, covering auth, missing/invalid/too-large/already-exists/
not-found, storage-unavailable degraded response, replace deleting the old
S3 object, and the organizer avatar's public-download and
`RideOrganizerSummary`/`GET /v1/organizers/me` propagation). Several
pre-existing tests across `apps/api`/`apps/web` needed a one-line
`avatarUrl: null`/`avatarUrl` fixture update for the new required field —
same cost `User`'s own doc comment already anticipated for exactly this
kind of change. `pnpm --filter ui test`: 94 passed, including 4 new `Avatar`
tests. `pnpm --filter web test`: 198 passed, including 13 new
`AvatarUploadForm` tests (8 participant, 5 organizer).

Decisions: none new — this implements ADR-019 point 7's already-decided
scope, not a fresh architectural choice; `packages/types/src/api/media.ts`
(new file, `AvatarResponse`) and the `lib/` relocation are implementation
detail, not architecture change.

Known issues resolved: KI-023 fully resolved (`Ride`/`User`/`OrganizerProfile`
avatar/cover-image gap is closed for all three entities now).

Follow-up: turbo.json's `test` task `env` allowlist doesn't include
`TEST_DATABASE_URL` (added by CR-095/KI-049, never added to `turbo.json`) —
`pnpm turbo test` silently drops it and every `apps/api` DB test fails with
"TEST_DATABASE_URL is required"; `pnpm --filter api test` (with `.env`
sourced, or CI's own direct env var) is unaffected and is what this session
used throughout. Logged as KI-050, not fixed here (unrelated to this
ticket's scope).

## 2026-09-20 — CR-098 — Live 2GIS MapGL rendering on the discovery map (resolve KI-031, ADR-020)

Summary: user supplied a real public `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` (confirmed it's
the same project key as `MAPS_2GIS_API_KEY` — one 2GIS project key valid for both the
Geocoder/Directions and MapGL JS products). Built the render-layer types
`packages/maps-core` had deliberately deferred (`MapRenderer`/`MapHandle`/
`MapMarkerInput`/`MapRenderOptions`, kept separate from the server-safe `MapProvider`),
implemented them in `packages/maps-2gis/src/render.ts` against the real `@2gis/mapgl`
SDK (this package's first genuine npm vendor dependency — previously 100% REST/`fetch`),
and wired one composition point in `apps/web`
(`src/lib/maps/create-map-renderer.ts`) — the "one composition point ... to wire the
concrete adapter" rule `.claude/rules/architecture.md` already stated but that had never
actually been built. New `DiscoveryMap` client component replaces `RideMapPlaceholder`
on `/`, plotting each published ride's `startLat`/`startLng` as a marker; falls back to
the same placeholder on a missing key or a failed render (`docs/design.md` §10's
degraded-state requirement, verified still working the same way in tests). Scope
deliberately limited to the discovery map — the route-detail map
(`RouteMapPlaceholder`, `Route.geometry` polyline, `RoutePoint`/`Stop` markers) is
KI-036's untouched follow-up, not widened into this ticket.

Implementation:

- `packages/maps-core/src/render.ts` (new): `MapMarkerInput { id, point }`,
  `MapRenderOptions { container: HTMLElement, center, zoom? }`, `MapHandle {
setMarkers, destroy }`, `MapRenderer { render(options): Promise<MapHandle> }`.
  Provider-neutral by construction (only `LatLng` + ordinary browser DOM types).
  `provider.ts`'s own doc comment updated to point at this file instead of carrying an
  inline "not added yet" note.
- `packages/maps-core`/`packages/maps-2gis` `tsconfig.json`: added `"lib": ["ES2022",
"DOM"]` (needed only for `render.ts`'s `HTMLElement` — the base `tsconfig.base.json`
  fragment stays `ES2022`-only for everything else in both packages).
- `packages/maps-2gis/src/render.ts` (new): `create2GisMapRenderer({ apiKey })` —
  `import('@2gis/mapgl')` dynamically inside `render()` (no import-time side effect,
  no `window`/DOM dependency until actually called from a browser), `mapglAPI.Map`/
  `Marker` wrapped behind `MapRenderer`/`MapHandle`. Coordinate order flip
  (`{lat, lng}` → `[lng, lat]`) happens once, at this boundary — confirmed against
  `@2gis/mapgl`'s own shipped `.d.ts` files (`Marker.setCoordinates`'s doc comment:
  "Coordinates `[longitude, latitude]`"), not assumed from an ambiguous README example.
- `packages/maps-2gis/package.json`: new dependency `@2gis/mapgl@^1.78.0`.
- `apps/web/src/lib/maps/create-map-renderer.ts` (new): the one composition point,
  reads `process.env.NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`, returns `null` when unset so
  callers can degrade instead of throwing.
- `apps/web/eslint.config.mjs`: `files`-scoped override (`no-restricted-imports: 'off'`)
  for exactly `src/lib/maps/create-map-renderer.ts` — CR-056's `*2gis*` glob also
  matches the bare `maps-2gis` workspace specifier, not just a vendor SDK name, so this
  is the one place that's now allowed to import it directly.
- `apps/web/package.json`: new workspace dependency `maps-2gis` (module resolution for
  the composition point above).
- `apps/web/src/features/participant/discovery/components/DiscoveryMap.tsx` (new):
  renders into a ref'd `<div>`, computes plottable rides (non-null `startLat`/
  `startLng`), centers on the first one (Moscow as a non-empty fallback otherwise),
  sets one marker per plottable ride, falls back to `RideMapPlaceholder` on no
  renderer/a failed `render()` call. Deliberately re-renders the map once per mount,
  not on every `rides` change (a real "update markers in place" path is follow-up work,
  noted inline).
- `apps/web/src/features/participant/discovery/components/DiscoveryList.tsx`: swapped
  `RideMapPlaceholder` for `DiscoveryMap`, updated its own doc comment.
- `RideMapPlaceholder.tsx`: doc comment updated — now documents itself as the fallback
  `DiscoveryMap` renders on failure, not "the map view" outright.

Validation: `pnpm turbo lint typecheck build` clean (all packages, including a stale
`.next/types` artifact from a concurrent build/typecheck race cleared with `rm -rf
apps/web/.next` before the final green run — same KI-038-adjacent gotcha CR-093 hit
before). `pnpm --filter web test` 198/198 passing (the existing CR-026 discovery test
asserting the degraded notice on the map tab is unaffected — `NEXT_PUBLIC_MAPS_2GIS_
MAPGL_KEY` is never set in the Vitest process env, so `createMapRenderer()` still
returns `null` in that suite, same fallback path exercised as before). `pnpm --filter
maps-2gis test` 11/11 passing.

Live verification (real headless browser, real Docker Postgres/Redis/MinIO, real 2GIS
API): seeded 3 published rides with real Moscow-area coordinates via the running API,
then drove `http://localhost:3000/` with the browser-automation skill. Confirmed via
network capture: `keys.api.2gis.com` key validation `200`, `styles.api.2gis.com` style
fetch `200`, ten `tile{0-3}-sdk.maps.2gis.com` vector tile requests `200` — zero failed
requests, zero console errors beyond one benign WebGL performance warning. Confirmed via
DOM inspection: the map panel contains a real MapGL `<canvas>` (with the SDK's own CSS
classes, zoom controls, and "2GIS" attribution watermark) plus three marker `<svg>`
elements at three distinct screen positions, matching the three seeded rides exactly.
The rendered screenshot itself showed a flat background rather than visible street
geometry — network/DOM evidence points at a headless/software-WebGL rasterization
limitation in this sandboxed browser, not a bug in the integration (real key validated,
real tiles fetched with the exact requested coordinates, real markers positioned
correctly); flagged here rather than silently assumed. All seeded test data (3 rides, 1
user, 1 organizer profile) deleted afterward; dev servers stopped.

Found and fixed one unrelated pre-existing gap while starting the dev servers for live
verification: the native dev `DATABASE_URL` database (`coffee_ride_dev`) had never had
CR-097's migration `0016_avatar_columns.sql` applied, so `GET /v1/rides` 500'd. Ran
`pnpm --filter db db:migrate` against it — resolved, logged as KI-051 (new, resolved
same session) rather than silently worked around.

Files: `packages/maps-core/src/{render,provider}.ts`, `packages/maps-core/src/index.ts`,
`packages/maps-core/tsconfig.json`, `packages/maps-2gis/src/{render,index}.ts`,
`packages/maps-2gis/{package,tsconfig}.json`, `apps/web/src/lib/maps/
create-map-renderer.ts`, `apps/web/eslint.config.mjs`, `apps/web/package.json`,
`apps/web/src/features/participant/discovery/components/{DiscoveryMap,DiscoveryList,
RideMapPlaceholder}.tsx`.

Decisions: ADR-020 (`docs/decisions.md`) — render-layer types in `maps-core`, one
composition point in `apps/web`, scoped ESLint override. `.claude/rules/maps.md`
updated to match (render-layer contract, composition-point note).

Follow-up: KI-036 (route-detail map — reuse `MapRenderer`, extend additively if a
polyline/typed-marker-icon capability is needed, don't build a second interface);
marker clustering at city zoom and click-to-select-with-keyboard-equivalent both stay
explicitly out of scope (`docs/design.md` §15/§12) until a real product need exists.

## 2026-09-20 — CR-099 — Fix findings from a user-run QA pass against a live browser

User ran a manual QA pass against a real browser session and reported seven findings.
Five were real bugs, fixed; two were investigated and found not to be bugs.

**Fixed:**

1. **Dark theme never activated** (KI-052, new, resolved same session). `packages/
ui/src/tokens.css` has defined a full `.dark` token set since CR-063, and
   `docs/design.md` calls it "not optional or later," but nothing ever applied the
   `.dark` class — emulating `prefers-color-scheme: dark` left the page fully light.
   `apps/web/src/app/layout.tsx` now injects a `next/script` `beforeInteractive`
   inline script that adds `.dark` to `<html>` when the OS preference matches,
   before hydration/paint (no flash of the wrong theme). No manual toggle —
   `docs/design.md` only requires the theme to exist and respond to the system
   preference. Live-verified: `document.documentElement.className` gains `dark`
   under emulation, `body`'s computed background flips from `rgb(250, 249, 247)`
   (`#faf9f7`) to `rgb(23, 22, 20)` (`#171614`) — an exact match to `tokens.css`.

2. **No shared nav on `/`, `/register`, `/login`** (KI-053, new, resolved same
   session). None of the three linked to each other or into a cabinet. New
   `SiteHeader` (`apps/web/src/components/site/SiteHeader.tsx`, a plain Server
   Component), applied via a new `(public)` route group wrapping exactly these
   three routes (moved in, same URLs) — deliberately not `/organizer/*`/`/me/*`
   (already have `CabinetShell`'s nav) or `/rides/[id]` (not part of the reported
   gap). Static by design: shows all four links (Заезды/Войти/Регистрация/Личный
   кабинет) unconditionally rather than fetching the session just to decide what
   to show — `/me` already redirects a logged-out visitor to `/login`. Also added
   direct cross-links inside the forms: `RegisterForm` → `/login`, `LoginForm` →
   `/register` and the new `/forgot-password`. New terms in `packages/ui/src/
terminology.ts` (`SITE_HEADER_TERMS`, three new `AUTH_TERMS` entries) — no
   hard-coded Russian strings in the component (`.claude/rules/frontend.md`).

3. **Register success screen's "verification link" 404'd** (part of KI-026).
   The dev-only note rendered `verificationUrl` verbatim — `/v1/auth/
verify-email?token=...`, a relative path missing `/api` _and_ a POST-only
   route, not a GET page — as if it were a clickable link. `RegisterForm` now
   extracts the token and links to the real `/verify-email?token=...` web page
   built for finding 4 below, instead of the raw API path.

4. **`/forgot-password`, `/reset-password`, `/verify-email` all 404'd** (KI-026,
   KI-042, both narrowed — the screens now exist, but production usability is
   still blocked on ADR-007's pending real email delivery, so neither is fully
   resolved). Three new `features/auth/*` modules (`verify-email`,
   `forgot-password`, `reset-password`), same pattern as the existing
   `register`/`login` ones: typed `api.ts` calling the corresponding already-
   built endpoint, a form/status component with loading/error/success states,
   a thin `app/*/page.tsx`. `verify-email`/`reset-password` read `?token=` via
   Next 15's `searchParams` Promise prop. New terminology blocks
   (`VERIFY_EMAIL_TERMS`, `FORGOT_PASSWORD_TERMS`, `RESET_PASSWORD_TERMS`).
   Live-verified end to end in a real browser against the real running stack:
   registered a real account through the UI, followed the rendered link, got
   "Email подтверждён"; `/forgot-password` showed the correct generic success
   state regardless of account existence (`.claude/rules/security.md` — no
   account enumeration); `/reset-password`'s missing-token state confirmed live,
   its token-present path covered by new tests against the same three server
   error codes `auth.routes.test.ts` already exercises server-side. No dev-only
   token field was added to `/forgot-password` — deliberately unchanged, by the
   same no-enumeration rule.

5. **No loading indicator on organizer edit/route/cover screens** (KI-054, new,
   resolved same session). Each screen's own client component (`EditRideForm`,
   `RouteUploadForm`, `CoverImageUploadForm`) already renders a `Skeleton` once
   mounted, but there was no Next.js `loading.tsx` for `/organizer/rides/[id]/*`
   — during the RSC navigation itself, nothing changed on screen until the new
   segment's payload arrived, reading as "~2-3.5s with only the static `<h1>`
   visible, looks hung." New `apps/web/src/app/organizer/rides/[id]/loading.tsx`
   — one shared boundary covering all five leaves (`edit`/`route`/`cover`/
   `participants`/`updates`), reusing the same `Skeleton` shapes.

**Investigated, not bugs — no code change:**

6. **2GIS map shows no visible street geometry in a headless sandbox browser.**
   Same conclusion CR-098 already reached and documented (KI-036's update,
   `project-state.md`): real key, real style/tile requests, real correctly-
   positioned markers, confirmed via network/DOM inspection — a headless/
   software-WebGL rasterization limit of the sandbox, not an integration bug.
   Recommended the user re-check in a normal, GPU-backed browser.

7. **Duplicate `GET /v1/organizers/me` on `/organizer` and `/organizer/profile`.**
   Each page fetches it from exactly one `useEffect` (`OrganizerProfileWidget`,
   `OrganizerProfileForm`) — the duplicate is React 18 Strict Mode's intentional
   dev-only double-invoke of effects (Next.js's default `reactStrictMode: true`,
   no override in `next.config.ts`): mount → cleanup → remount, correctly guarded
   against a double `setState` by each effect's own `cancelled` flag, but the
   underlying `fetch` still fires twice. Universal to every `useEffect`-based
   fetch in this codebase (`EditRideForm`, `RouteUploadForm`, `CabinetShell`, …),
   not specific to these two files; absent from a production build; not worth
   removing Strict Mode (a real safety net) to silence.

Files: `apps/web/src/app/layout.tsx`, `apps/web/src/components/site/SiteHeader.tsx`
(new), `apps/web/src/app/(public)/{layout,page}.tsx` (new group; `page.tsx`/
`register/page.tsx`/`login/page.tsx` moved in unchanged), `apps/web/src/features/
auth/{register/components/RegisterForm,login/components/LoginForm}.tsx`,
`apps/web/src/features/auth/{verify-email,forgot-password,reset-password}/**` (new),
`apps/web/src/app/{verify-email,forgot-password,reset-password}/page.tsx` (new),
`apps/web/src/app/organizer/rides/[id]/loading.tsx` (new), `packages/ui/src/
terminology.ts`.

Validation: `pnpm --filter ui typecheck` clean; `pnpm --filter web typecheck`/`lint`/
`build` clean; `pnpm --filter web test` 208/208 passing (10 new: verify-email,
forgot-password, reset-password). Live-verified in a real browser (dark mode
emulation, full register → verify-email → forgot-password flow, nav link
resolution on all three public routes) against the real running stack — zero
console errors, zero failed requests (beyond one `net::ERR_ABORTED` from the test
script's own mid-navigation cleanup, not a real failure). Test accounts created
during live verification deleted afterward.

Follow-up: KI-026/KI-042 still need ADR-007's real email delivery before either
verification/reset flow is usable by a real production user, not just in dev/QA — the
screens alone don't close that. A manual dark-theme toggle remains a reasonable future
enhancement if a real user asks for one. The Strict-Mode double-fetch pattern is
universal across this codebase's data-fetching components — worth an SWR/React Query
adoption discussion someday, but out of scope for a QA-findings fix.

## 2026-09-20 — CR-100 — Real email delivery via Unisender Go (ADR-007: Pending → Accepted)

User supplied a real Unisender Go API key and asked to connect it. Closes the remaining
blocker KI-026/KI-042 both named: CR-099's `/verify-email`/`/reset-password` screens
existed and worked in dev/QA, but a real production user could never reach either
without real email delivery.

Adapter, not a new package: only `apps/api` ever sends email (unlike maps, which needed
both `apps/web` rendering and `apps/api` geocoding, justifying ADR-010's two-package
split) — `apps/api/src/lib/email/{email-provider,unisender-provider}.ts` is a single
consumer's adapter module, same shape as `modules/rides/route-storage.ts`'s S3 wrapper,
not a `packages/notifications-*` workspace member. `EmailProvider` interface + real
`UnisenderEmailProvider` implementation, wrapped in `callWithResilience` (8s timeout, one
shared `CircuitBreaker`, **deliberately no retry** — unlike S3's PUT/GET/DELETE-by-key,
sending a transactional email is not idempotency-safe: a retry after a client-side
timeout could double-send if the first attempt actually succeeded server-side;
`.claude/rules/resilience.md`'s "don't retry a non-idempotent operation" applies
directly). `ResilienceError` normalized into `EmailDeliveryError` at the adapter
boundary, never crossing it.

Unisender Go's REST contract was verified against the real `django-anymail` project's
Unisender Go backend source on GitHub, not guessed (`godocs.unisender.ru`, the vendor's
own docs domain, fails DNS resolution from this sandbox — see KI-055 below): `POST
{apiUrl}email/send.json`, header `X-API-KEY: <key>`, body `{ message: { from_email,
from_name, subject, body: { html, plaintext }, recipients: [{ email }] } }`; success is
`{ status: "success", ... }`; a per-recipient rejection surfaces in `failed_emails`, not
as a non-2xx status.

Delivery reuses CR-050's existing `notifications` BullMQ queue rather than a parallel
mechanism: `notifications.service.ts` gained two new job names
(`verification_email`/`password_reset_email`), two new producer functions
(`sendVerificationEmail`/`sendPasswordResetEmail` — same enqueue-or-direct-fallback shape
every existing producer already uses), and `processNotificationJob` gained an
`emailProvider` parameter (`queue.ts`'s worker call site updated to match). Neither
producer ever logs the recipient's email address or the raw token embedded in the
verify/reset URL (`.claude/rules/security.md`) — a failure logs only `{ err }`.

`apps/api/src/plugins/email.ts` (new) decorates `app.emailProvider`, registered in
`app.ts` right after `registerS3`/before `registerNotificationQueue` (the worker's job
processor reads `app.emailProvider` at call time). Same all-or-nothing gate
`registerS3` uses for its five `S3_*` vars: both new `UNISENDER_API_KEY` and
`EMAIL_FROM_ADDRESS` env vars must be set together to activate a real provider — either
alone, or neither, leaves `app.emailProvider = null`, and every producer silently no-ops
(same degraded-mode shape as `app.s3`/2GIS, never a boot-time crash). `env.ts` gained
these two plus `UNISENDER_API_URL` (defaulted to `go1`'s endpoint — Unisender Go splits
accounts across `go1`/`go2` data centers) and `EMAIL_FROM_NAME` (defaulted to "Coffee
Ride").

`auth.routes.ts`: `POST /v1/auth/register` now calls `sendVerificationEmail` with
`${WEB_ORIGIN}/verify-email?token=...` (the real web page CR-099 built) alongside its
unchanged dev-only `verificationUrl` response field (still the raw, POST-only API path —
kept for the direct-POST live-check/manual-QA workflow, not meant to be followed in a
browser). `POST /v1/auth/forgot-password` now calls `sendPasswordResetEmail` only when
`requestPasswordReset` reports `userFound: true` — the HTTP response stays the identical
`204` regardless of that branch (`.claude/rules/security.md`: no account enumeration is
enforced by the response never depending on it, not by anything in the email-sending
call itself).

The real API key was pasted directly into chat — treated as a secret throughout: written
only to the local, gitignored `.env` (never `.env.example`, which got placeholder-only
entries), never logged, never appears in this changelog entry or any commit.

Not fully resolved, for two independent reasons, both now tracked (KI-026/KI-042 stay
narrowed; new KI-055):

1. No `EMAIL_FROM_ADDRESS` configured — no sender is verified in the user's Unisender Go
   account yet, so `app.emailProvider` stays `null` today and every producer's real
   branch has never actually executed outside a test.
2. `unisender.ru` (`go1`/`go2` subdomains, and the docs domain `godocs.unisender.ru`)
   fails DNS resolution from this sandbox specifically — confirmed via `nslookup`
   (`SERVFAIL`) and not a blanket `.ru` TLD block (`ya.ru` resolves fine). A real send
   has never been exercised live in this environment, only against mocked `fetch`
   matching the verified real request/response shape.

Files: `apps/api/src/env.ts`, `.env.example`, `apps/api/src/lib/email/{email-provider,
unisender-provider,unisender-provider.test}.ts`, `apps/api/src/plugins/email.ts` (new),
`apps/api/src/app.ts`, `apps/api/src/modules/notifications/{notifications.service,
queue,queue.test}.ts`, `apps/api/src/modules/auth/auth.routes.ts`.

Decisions: ADR-007 updated in place (`docs/decisions.md`) — `Status: Pending` →
`Status: Accepted 2026-09-20 (CR-100)`, provider named (Unisender Go), adapter shape and
queue-reuse rationale recorded. Same in-place-status-transition precedent ADR-003 already
established in this doc (not a new ADR number — ADR-007's own text was the thing this
ticket resolved, same as any other Pending→Accepted lifecycle step).

Validation: `pnpm --filter api typecheck`/`lint` clean; `pnpm --filter api test`
374/375 passing, 1 skipped (5 new: `unisender-provider.test.ts`'s request-shape/error-
normalization/no-retry cases against mocked `fetch`); `pnpm --filter api build` clean.
Live-verified against the real running stack (real Postgres): killed several stray
leftover `tsx watch src/server.ts` processes from earlier sessions first (one was
silently absorbing requests on :4000 under the pre-CR-100 code, which would have made an
initial live check pass against the wrong build entirely — caught before it did), then
booted a fresh server with the new env vars/plugin — `/health` `200`, `POST /v1/auth/
register` `201` with the unchanged dev-only field, `POST /v1/auth/forgot-password`
`204` identically for both a real and a nonexistent account, zero errors in the server
log, no secret/token/email address logged anywhere. Test accounts deleted from the dev
DB afterward; dev server stopped.

Follow-up: user needs to configure `EMAIL_FROM_ADDRESS` (a sender verified in their
Unisender Go account) before any real email can send; the first session with real
network access to `unisender.ru` should then verify one real send end to end (KI-055's
own "Next action"). `docker-compose.prod.yml`'s env passthrough (KI-046's pattern) will
need these four new vars added when CR-075/ADR-018's production manifest is actually
exercised end to end (KI-045) — not attempted this session, out of scope.

## 2026-09-20 — CR-101 — Route-detail map rendering (KI-036)

Summary: `/rides/[id]`'s route map showed a static `RouteMapPlaceholder` since CR-028,
even after CR-098/ADR-020 proved real 2GIS MapGL rendering on the discovery map. This
closes KI-036's named remaining scope: `Route.geometry` as a polyline plus
`RoutePoint`/`Stop` as typed markers, reusing `DiscoveryMap`'s `MapRenderer`/`MapHandle`
interface rather than a second render abstraction (as KI-036 itself anticipated — no new
ADR). `packages/maps-core/src/render.ts`: `MapMarkerInput` gains optional `color`/`label`;
new `MapPolylineInput`; `MapHandle` gains `setPolyline(polyline: MapPolylineInput | null):
void`. `packages/maps-2gis/src/render.ts` implements both: a marker with `color`/`label`
renders as a small `HtmlMarker` (colored dot + one-glyph text) instead of the SDK's plain
pin; `setPolyline` draws/clears one `Polyline`. New `apps/web/src/lib/maps/css-color.ts`
(`getCssColorVar`) resolves a design-token CSS custom property to its current computed
value at call time — the one sanctioned exception to "never a raw hex literal"
(`docs/design.md` §14, ESLint-enforced in `apps/web`): a map SDK draws on canvas, not the
DOM, so it can't consume a Tailwind class, but it can still read the same token via
`getComputedStyle`, theme-aware. New feature-local `apps/web/src/features/participant/
ride-detail/lib/route-point-colors.ts` maps each `RoutePointType`/`Stop` to a token CSS
var + one-glyph Cyrillic label (danger→`--danger`+`!`, water→`--info`+`В`, etc.) — the
glyph exists specifically so a colorblind viewer isn't relying on hue alone
(`.claude/rules/frontend.md`). New `RouteMap.tsx` mirrors `DiscoveryMap`'s pattern (single
mount-time effect, falls back to `RouteMapPlaceholder` on a missing key or failed render)
plus a text legend under the map. `RideDetailView`'s `RouteSection` now threads
`routePoints`/`stops` through (the `GetRideResponse.routePoints` array already existed,
just unused by this view before) and renders `RouteMap` once geometry is `ready`.

Found and fixed a real bug while live-verifying, not present in any prior CR's own
verification because CR-098 apparently never re-loaded the discovery map enough times to
hit it: React Strict Mode's dev-only double-`useEffect`-invoke starts two `render()` calls
back-to-back on the _same_ container before either call's `await import('@2gis/mapgl')`
resolves. Both then went on to construct a real `mapglAPI.Map` on that container; when the
stale (cancelled) call's promise resolved later and correctly called `destroy()` on its own
instance, that `destroy()` cleared the _container's_ DOM, wiping out the surviving
instance's canvas too — reproduced consistently (0/3 canvases across three fresh page
loads) before the fix, 3/3 after. `DiscoveryMap` carries the identical exposure since
CR-098 (same effect shape); fixed once, in the shared adapter
(`packages/maps-2gis/src/render.ts`'s new per-container `WeakMap<HTMLElement, number>`
generation guard — a `render()` call whose generation gets superseded while the SDK is
still loading returns an inert no-op handle instead of constructing a second live map), so
both callers benefit without touching either's calling code. Production builds don't
double-invoke effects, so this was always dev-only, but a broken dev-mode map is still a
real bug, not acceptable to ship silently.

Files: `packages/maps-core/src/render.ts`, `packages/maps-2gis/src/render.ts`,
`.claude/rules/maps.md` (Render-layer contract snippet updated to match), `apps/web/src/
lib/maps/css-color.ts` (new), `apps/web/src/features/participant/ride-detail/lib/
route-point-colors.ts` (new), `apps/web/src/features/participant/ride-detail/components/
{RouteMap.tsx (new), RouteMapPlaceholder.tsx, RideDetailView.tsx}`.

Decisions: none (additive extension of ADR-020's existing render-layer contract, as
KI-036 itself named this exact extension in advance — no new ADR needed).

Live verification: seeded a real published ride via the running API (GPX route with 9
track points, 4 typed route points — start/finish/danger/water — and 1 stop) and loaded
`/rides/:id` in a real headless browser with the real `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`.
Full network chain succeeded (style/tiles/fonts/POI icons all `200`); the legend rendered
all five expected labels. The map's own pixels don't visibly paint in this sandbox's
headless/software-WebGL (SwiftShader) browser — same conclusion CR-098/CR-099 already
reached and documented, not a regression here. `pnpm --filter maps-2gis test` 11/11 (no
new tests needed — the fix is behind the same interface, already covered);
`pnpm --filter maps-core --filter maps-2gis typecheck/lint/build` clean; `pnpm --filter
web typecheck/lint/test/build` all clean (208/208 passing, no new tests — same
no-unit-test-for-the-SDK-boundary precedent `DiscoveryMap` already established, since a
real render can't be meaningfully unit-tested without the vendor SDK).

Follow-up: none required for this ticket's own scope. `docs/tasks.md` has no unchecked
ticket left again. Two real, un-scheduled UI gaps remain from the last status review:
`MapProvider.geocode`/`reverseGeocode` still has zero UI consumers (KI-032, no
address-search anywhere), and discovery's filters still cover only `bicycleType`
(KI-030, no design-doc spec yet for distance/difficulty/price/date-range).

## 2026-09-21 — CR-102 — Fix a dead-space layout bug found via `/impeccable critique`

Summary: ran the `impeccable` skill's `critique` command against `apps/web` (dual
sub-agent design review + live-browser evidence pass, at the user's request, ahead of a
planned visual-direction pass). Two candidate "bugs" came out of it; only one was real.

Real bug, fixed: `RideDetailView`'s two-column layout (`md:grid md:grid-cols-2`, CR-023)
rendered unconditionally regardless of content — `RouteSection` only renders when
`route` is non-null and `StopList` returns `null` for an empty `stops` array, both
correct on their own, but together they meant a ride with neither a route nor stops
(both optional per `docs/product.md`) left the entire right-hand grid column blank.
Confirmed live during the critique's browser-evidence pass against a real seeded ride
("QA Визуальный заезд") — ~55% of the viewport rendered as dead page background.
Fixed by computing `hasRouteOrStops = route !== null || stops.length > 0` and
collapsing to a single flex column (same shape the screen already uses below `md`)
whenever it's false, instead of reserving a grid track for nothing.

Not a bug, left unchanged: the same critique flagged `RideCard`/`RideDetailView`
omitting a `MetricTile` entirely (rather than rendering it with an em dash) when its
value is `null`, reading this as contradicting `docs/design.md` §6's "a missing value
renders as `—`, never an empty box" rule. Checking `docs/changelog-archive/2026.md`'s
CR-023 entry (2026-09-15) shows this was a deliberate, explicit decision at the time —
"omitting rather than em-dashing anything still null" — not an oversight, and both
components' code comments already say so correctly. The real (minor) gap is that
`docs/design.md` §6 was never updated to note this carve-out from its general rule;
left as a documentation note, not a code change, since reversing a recorded product
decision needs its own explicit call, not an automatic "fix."

Files: `apps/web/src/features/participant/ride-detail/components/RideDetailView.tsx`,
`apps/web/src/features/participant/ride-detail/ride-detail.test.tsx`.

Decisions: none new — a bug fix within CR-023's existing two-column layout, not a
change to it.

Validation: `pnpm --filter web test` 210/210 (2 new regression tests: the grid
collapses to one column with no route/stops, and stays two-column once either
exists); `pnpm --filter web typecheck` clean; `pnpm --filter web exec eslint` clean on
both changed files.

Follow-up: the `docs/design.md` §6 documentation gap noted above is unaddressed. The
critique's separately-flagged priority issues (no confirmation on registration/
cancellation, no confirm-before-cancel, inert cover photo/route map, a new visual
direction synthesized from five user-supplied references) are queued for a later
session — see `apps/web/.impeccable/critique/2026-09-21T15-54-48Z__apps-web.md` for
the full report. The critique session also found `impeccable detect`'s mechanical
scanner non-functional in this environment (returns `[]` even on deliberately-bad
fixtures, independent of the earlier-suspected engine-version mismatch, which turned
out to be two intentionally-separate version numbers, not corruption) — an upstream
tool issue, not a Coffee Ride defect, not tracked in `known-issues.md` since it's not
project-internal.
