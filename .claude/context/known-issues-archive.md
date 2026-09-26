# Known Issues — Resolved Archive

Resolved `known-issues.md` entries, moved here verbatim per that file's Archiving
section so the live file only carries active risk. Content is preserved exactly —
this is history for audits, not routine agent context. The corresponding
`docs/changelog.md` CR entry (see the archived changelog too, if old enough) is
still the primary record of _why_; this file exists so a KI-number cross-reference
from another doc still resolves to something.

---

### KI-036 — Route points have no participant-facing UI yet (organizer management + API only)

Status: resolved 2026-09-20 (CR-101). Discovered: 2026-09-15 (CR-031, "Route points"
session).
Problem: `docs/design.md` §8's ride-detail screen row names "route + profile,
stops, services, requirements..." for the participant view — no route-points
list is named there, unlike `Stop`, which explicitly got a `StopList`
(CR-030). A `RoutePoint` is a typed map pin (start/finish/danger/water/food/
technical/other), meant to render on a real map, not to be read as a text
list — and the map itself is already a documented degraded placeholder
pending a live 2GIS credential (KI-031/KI-016). Building a textual duplicate
of pin data wasn't asked for by any doc, so this ticket shipped the DB
table + API + organizer management UI (`RoutePointsSection`) only.
Impact: low — organizers can fully manage route points; participants simply
don't see them anywhere yet (`GET /v1/rides/:id`'s additive `routePoints`
array is there, just unconsumed on the participant side).
Workaround: none needed — nothing regresses; the data is preserved and
available via the API the moment a consumer needs it.
Next action: once KI-031 is resolved (a live 2GIS MapGL credential exists)
and the real map render layer is built, plot each ride's `routePoints` as
typed markers on `/rides/[id]`'s route map — that is the natural, asked-for
participant surface for this data, not a new textual list component.
Update 2026-09-20 (CR-098, ADR-020): KI-031's discovery half is resolved and
the render layer now exists — `packages/maps-core`'s `MapRenderer`/
`MapHandle` plus `packages/maps-2gis`'s real `@2gis/mapgl` implementation,
proven working end to end on `/`. This ticket's own scope (route-detail map:
`RouteMapPlaceholder` → real render, `Route.geometry` polyline +
`routePoints` typed markers + `Stop` markers) is deliberately unstarted —
reuse the existing `MapRenderer` interface, extending it additively
(`.claude/rules/extensibility.md`) if a polyline layer or typed marker icons
turn out to need capabilities the discovery-only MVP doesn't have, rather
than building a second, parallel render abstraction.
Resolution: CR-101 — `RouteMap.tsx` (new) plots `Route.geometry` as a
polyline and `RoutePoint`/`Stop` as typed, colored+labeled markers on
`/rides/[id]`, exactly as this entry's "Next action" specified — the
`MapRenderer` interface was extended additively (`MapMarkerInput`
`color`/`label`, new `setPolyline`), no second render abstraction, no new
ADR. Live-verified against a real seeded ride; also surfaced and fixed a
real, previously-latent React Strict Mode double-render race in the shared
`packages/maps-2gis` adapter (see `docs/changelog.md`'s CR-101 entry) that
`DiscoveryMap` carried since CR-098 too.

### KI-019 — `docker-compose.yml` had never been booted live in this environment

Resolved: 2026-09-20 (this became true at least by CR-086's session, which
live-verified against real running MinIO — this entry just hadn't been
updated). Discovered: 2026-09-13 (CR-009).
Problem: the Docker daemon didn't come up in earlier Claude Code sessions in
this environment (see `docker-desktop-unavailable` in Claude's project
memory) — `docker compose up -d` failed with "Cannot connect to the Docker
daemon", so the compose file (Postgres/Redis/MinIO) had only ever been
syntax-checked (`docker compose config`), never actually started.
Resolution: this environment now has a working Docker daemon —
`docker ps` this session showed all three `coffeeride-{postgres,minio,redis}-1`
containers `Up`/`healthy`, and `GET /health` against a live-booted `apps/api`
returned `{"db":"ok","redis":"ok","s3":"ok"}`, all three genuinely reachable
(not just configured). CR-097's own avatar work was live-verified end to end
against this real stack (register → verify → login → upload → real MinIO
object confirmed via `mc find` → download round-trips real resized bytes →
delete confirmed both the DB field and a real S3 object removal). Whether a
_future_ session's environment still has Docker is not guaranteed by this
entry — if `docker ps`/`docker info` fails again, that's a new occurrence of
the same underlying constraint, not a regression of this fix.
Workaround: n/a — re-open a new entry if the daemon becomes unreachable in a
future session.

### KI-023 — Profile avatar/photo upload is not implemented

Resolved: 2026-09-20 (CR-097). Discovered: 2026-09-14 (CR-013). Widened:
2026-09-14 (CR-014, CR-017 — same gap on `OrganizerProfile` then `Ride`).
Problem: `docs/design.md` §9 named an `Avatar` component in `packages/ui`'s
inventory, but none of `User`/`OrganizerProfile`/`Ride` had a real
upload/serve path — deliberately scoped out of each entity's own ticket, not
an oversight.
Resolution, in two stages: CR-086 (2026-09-20, ADR-019) resolved the `Ride`
third — cover image validate/resize/S3-storage pipeline, deliberately written
generic for reuse. CR-097 (this session) resolved the remaining two: relocated
CR-086's `cover-image.ts`/`cover-image-storage.ts` out of `modules/rides/`
into `apps/api/src/lib/image-processing.ts`/`image-storage.ts` (generic
names) so `modules/users`/`modules/organizers` could reuse them without
reaching into another capability module's internals
(`.claude/rules/resilience.md`), added `avatar_key`/`avatar_content_type`/
`avatar_size_bytes` to both `users` and `organizer_profiles`, and added
`POST`/`PATCH`/`DELETE`/`GET /v1/users/me/avatar` ("me"-scoped, no public
`:id` variant) and `POST`/`PATCH`/`DELETE /v1/organizers/me/avatar` plus a
public `GET /v1/organizers/:id/avatar` (an organizer's identity is already
public via `RideOrganizerSummary`, so this needed no viewer-visibility
check). `packages/ui` gained its first real `Avatar` component; upload UI
wired into `/me/profile` and `/organizer/profile`. See `docs/changelog.md`
2026-09-20 CR-097 for full detail.

### KI-049 — `apps/api`'s test suite deletes real data when run against `.env`'s native `DATABASE_URL`

Resolved: 2026-09-20 (CR-095). Discovered: 2026-09-20 (CR-086 session),
while running the local dev servers for manual browser QA.
Problem: most `apps/api/src/modules/**/*.routes.test.ts` files run `DELETE FROM
rides`/`DELETE FROM users` (cascading via FK to `organizer_profiles`,
`sessions`, `routes`, `stops`, `route_points`, `registrations`,
`waitlist_entries`, `notifications`, `reviews`, etc.) in `beforeEach`/`afterAll`
against whatever `DATABASE_URL` is present in the environment — there was no
distinction between a disposable CI/test database and a real one. That
session ran `pnpm --filter api test`/`pnpm turbo run test` with `.env` sourced
first (`set -a && source .env && set +a`) to get `DATABASE_URL` populated
(the test files threw immediately if it was unset) — but per KI-047, `.env`'s
`DATABASE_URL` deliberately points at the real native Homebrew Postgres
(`coffee_ride_dev`) carrying real accumulated manual-QA data (22 users, 13
rides, 7 registrations as of KI-047's 2026-09-19 discovery), not a disposable
test database. The suite ran clean (all green) but wiped that data as a side
effect: `coffee_ride_dev` had 1 user/0 rides immediately afterward.
Impact: high for local manual-QA continuity (every organizer/ride an earlier
session hand-created via the running dev app disappeared with no warning),
zero for CI (its `DATABASE_URL` points at a disposable per-run Postgres
service container, the intended target of these cleanup statements) and zero
for production (this is the developer's own local machine, `coffee_ride_dev`
is never a deployed database). User confirmed the lost data was
disposable test/QA data and did not need restoring.
Resolution: new `apps/api/src/test-support/test-database-url.ts`
(`getTestDatabaseUrl`) — all 13 `apps/api` test files that touch a real
Postgres now read `TEST_DATABASE_URL`, a variable `.env` never sets at all,
instead of `DATABASE_URL`. Sourcing `.env` can therefore no longer feed the
suite a real database under any circumstance — a structural fix, not a
workaround to remember. Second, independent layer: even a correctly-set
`TEST_DATABASE_URL` is refused unless its database name looks disposable
(contains "test", or is exactly "coffee_ride") — live-verified this refuses
`coffee_ride_dev` by name with a clear error. `.env.example`/`.env`/
`.github/workflows/ci.yml` all set `TEST_DATABASE_URL`; local `.env`'s value
uses `127.0.0.1` explicitly rather than `localhost`, since this machine runs
both a native Postgres (`DATABASE_URL`, resolves via `::1`) and Docker
Compose's Postgres (`TEST_DATABASE_URL`) on port 5432 at once — relying on
`localhost`'s address-family resolution order to keep them apart was part of
how this incident happened unnoticed. Live-verified end to end: migrated the
previously-empty Docker Compose `coffee_ride` database, sourced `.env` (the
exact scenario that caused the incident), ran the full `apps/api` suite (345
passed, 1 skipped), and confirmed `coffee_ride_dev`'s row count was
unchanged before and after.
Also addressed the backup gap this incident exposed (no backup existed to
restore from): took an immediate real backup of `coffee_ride_dev`
(`packages/db/backups/`, gitignored); `docker-compose.prod.yml` gained a
`backup` service that runs `packages/db/scripts/backup.sh` (CR-078)
automatically on `docker compose up` — not gated behind a profile, since a
backup is read-only against the database — repeating on
`BACKUP_INTERVAL_SECONDS` (default daily), replacing the previous
"documented cron line nobody ever installed" state. `docs/database.md`'s
Backups section rewritten accordingly. See `docs/changelog.md`'s CR-095
entry for full detail, including a real bug caught and fixed while
validating the compose change (`$$`-escaping needed for the backup loop's
interval variable so Compose doesn't interpolate it at config-render time).
Next action: none for this KI. CR-086 (cover image pipeline) remains the
only unchecked, unblocked ticket in `docs/tasks.md`.

### KI-048 — Nothing calls `app.close()` on SIGTERM/SIGINT; no real graceful shutdown exists

Resolved: 2026-09-19 (CR-094). Discovered: 2026-09-19 (CR-058, "Redis-backed
auth rate limiting" session), incidentally while live-verifying that a
rate-limit Redis-store failure fails open rather than hanging a request.
Problem: `apps/api/src/modules/notifications/queue.ts`'s own `onClose` hook
comment says its bounded `raceTimeout`s exist so "a degraded Redis... would
hang the whole app's graceful shutdown (`app.close()`, e.g. on SIGTERM)" —
but `apps/api/src/server.ts` never registered a `SIGTERM`/`SIGINT` handler at
all (confirmed by grep: `queue.ts`'s comment was the only place either
string appeared in `apps/api/src`). `app.listen()` was called and the
process just ran; on a real `docker stop`/orchestrator SIGTERM, Node's
default behavior for an unhandled `SIGTERM` is immediate termination —
`app.close()` (and therefore every `onClose` hook: the notification queue's
worker/producer disconnect, `db.ts`'s Postgres pool close, etc.) never ran
at all.
Impact: medium — a production deploy/redeploy (`docker compose up -d
--build`, CR-075/ADR-018) or a scaling-down event killed `apps/api`
mid-request and mid-in-flight-BullMQ-job with zero drain time, not "hangs
briefly then recovers" as the existing code comments implied. Confirmed the
gap wasn't specific to a degraded Redis either — nothing triggered
`app.close()` at all, degraded dependency or not.
Resolution: new `apps/api/src/lib/graceful-shutdown.ts`
(`registerGracefulShutdown`), wired into `server.ts` right after
`buildApp()`. First `SIGTERM`/`SIGINT` calls `app.close()` under a 10s hard
fallback timeout (defense in depth beyond `queue.ts`'s own bounded 3s
`onClose` hook, also covers `db.ts`'s unbounded pool `.end()`) — success
exits 0, a rejecting `close()` or a timed-out close exits 1. A second signal
mid-shutdown forces an immediate exit 1 instead of waiting on a possibly
stuck close. Dependency-injectable (signals source + exit function) so it's
unit-tested (5 tests) without sending a real OS signal or killing the test
process; real signal delivery against a running container still can't be
live-verified in this sandbox (KI-019, Docker daemon unreachable) — same
limitation every Redis/S3/Docker-dependent CR here has hit.
Next action: none — first real deploy should still confirm a `docker stop`
against a live container logs "Received shutdown signal, closing
gracefully." and exits promptly, per KI-045's own deploy-time checklist.

---

### KI-022 — Auth endpoints ship with an interim, weaker security posture than `.claude/rules/security.md`'s full checklist

Resolved: 2026-09-19 (CR-058). Discovered: 2026-09-13 (CR-011).
Problem: CR-011 is the first ticket to add real auth endpoints
(`POST /v1/auth/register`, `POST /v1/auth/verify-email`), but three items
`.claude/rules/security.md` calls for were deliberately not yet in place,
per the CR-011 plan's own documented scope boundaries (not oversights):
(1) rate limiting on `/v1/auth/*` uses `@fastify/rate-limit`'s in-memory
store, per-IP only (5/min) — no per-account limiting, and the counter resets
on every process restart / isn't shared across multiple `apps/api` instances;
(2) no `@fastify/helmet` security headers (CSP, X-Content-Type-Options,
frame-ancestors) on any response yet; (3) no `Origin`/`Referer` CSRF check
on unsafe methods yet.
Update 2026-09-13 (CR-012): item (3) is resolved — `apps/api/src/plugins/
csrf.ts` now rejects a mismatched `Origin`/`Referer` on every unsafe `/v1`
method (`403 csrf_origin_mismatch`), live-verified with curl against a real
Postgres + running `apps/api`. Items (1) and (2) remain open.
Impact: lower than at CR-011 time — the CSRF gap that mattered most once a
real cookie session existed (CR-012) is now closed. `/v1/auth/register` and
the new session-bearing endpoints are still reachable with only IP-based
in-memory rate limiting and no security-header hardening standing between
them and abuse.
Workaround: none needed for CSRF. Still do not deploy `apps/api` publicly
before CR-061 (security headers) lands.
Next action: CR-058 (`docs/tasks.md`) upgrades auth rate limiting to a
Redis-backed, per-IP-and-per-account limiter once KI-014 (Redis unverified in
this environment) is resolved; CR-061 (now headers-only, see `docs/tasks.md`)
adds `@fastify/helmet`. Revisit this entry once both land.
Update 2026-09-16 (CR-047, "Security review"): re-verified against the full
`.claude/rules/security.md` checklist, not just auth. Both remaining items are
broader than originally scoped here — (1) is every abuse-prone endpoint, not
just `/v1/auth/*` (the same in-memory, per-IP-only `@fastify/rate-limit`
default store is the only rate limiting registered anywhere in `apps/api`);
(2) is every response `apps/api` sends, not just auth responses (no
`@fastify/helmet` or equivalent is registered at all — zero security headers,
API-wide). Everything else on the checklist (Argon2id hashing, no plaintext
anywhere, account-enumeration-safe login errors, session cookie flags,
consistent server-side ownership checks, Zod on every route, parameterized
Drizzle queries, minimized participant responses, audit columns) was verified
compliant this session — no new gaps found beyond these two, already-tracked
ones. Scope decision: fix only what's this task's own (CR-044/045/046/048),
document CR-058/CR-061's exact scope rather than implement it under CR-047,
per `.claude/context/current-task.md`.
Update 2026-09-17 (CR-061, "Security headers"): item (2) is resolved —
`@fastify/helmet` is now registered globally in `apps/api/src/app.ts`
(`plugins/security-headers.ts`), so every response (`/health`, `/docs`,
`/v1/*` alike) carries `Content-Security-Policy`,
`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`,
and helmet's other standard headers. CSP is customized, not left at helmet's
raw defaults: `upgrade-insecure-requests` is explicitly removed (this app
never terminates TLS itself — the default directive would break `/docs` over
local `http://`, rewriting its own same-origin sub-requests to `https://`
with no listener there) and `frame-ancestors`/`X-Frame-Options` are tightened
to `'none'`/`DENY` (helmet's own defaults are `'self'`/`SAMEORIGIN`). Only
item (1) remains open — narrower now than CR-047's audit found it, since
CR-058 is the tracked ticket for it (blocked on KI-014).
Impact: lowered further — the two items CR-047's audit widened to "every
endpoint"/"every response" are now one item, not two.
Update 2026-09-19 (CR-058, "Redis-backed, per-IP-and-per-account auth rate
limiting"): item (1) is resolved. Docker/a live Redis happened to be up in
this session (KI-014's connection-level gap had just closed), so this
session took the opportunity instead of waiting further. `app.ts`'s global
`@fastify/rate-limit` registration now passes `app.redis` into the plugin's
own `RedisStore` when `REDIS_URL` is configured (shared across instances,
not per-process) with `skipOnError: true` — falls back to the plugin's
in-memory store when Redis isn't configured, unchanged from before. A new,
independent per-account tier (`apps/api/src/lib/account-rate-limit.ts`,
atomic `MULTI INCR + PEXPIRE ... NX EXEC`, no Lua needed) applies to
`/register`/`/login`/`/forgot-password` — the three endpoints
`.claude/rules/security.md` names — keyed by the normalized email, entirely
independent of the per-IP tier. Both tiers fail OPEN on a Redis error/
timeout (`.claude/rules/resilience.md`: login/register are critical
journeys) — live-verified, not just reasoned about: stopped the real `redis`
container mid-session and confirmed `POST /v1/auth/login` still replied
`401` in ~1.3s (not hung, not `500`), then restarted it. Also live-verified
(twice, back to back) against the real, currently-running Redis: 38/38
`auth.routes.test.ts` tests pass, including two new tests that boot
`buildApp()` with a real `REDIS_URL` — something no existing test exercised
before this session. Found and fixed one real regression along the way:
`routes/health.test.ts`'s mocked `ioredis` client lacked `defineCommand`,
which `RedisStore`'s constructor now calls unconditionally on `app.redis` —
fixed by predefining `rateLimit`/`rateLimitRead` directly on the mock
(sidesteps needing to fake `defineCommand`'s dynamic-command machinery for a
suite that has nothing to do with rate limiting). See `docs/changelog.md`'s
CR-058 entry.
Next action: none for this KI. Incidentally discovered a separate, real gap
while live-verifying the fail-open behavior — see KI-048 (new) / CR-094.

### KI-007 — CI cannot test uploads or run e2e

Resolved: 2026-09-19 (CR-080). Discovered: 2026-09-11.
Problem: no MinIO service, no Playwright job in `.github/workflows/ci.yml`
(the "no migration step" third of the original problem statement was
actually already stale by the time this session picked it up — `pnpm
--filter db db:migrate` has been a real CI step since CR-011; this entry's
text was simply never corrected after that landed).
Impact: the three critical journeys named in `.claude/rules/testing.md`
were never verified automatically, and KI-015 (S3 client never connected to
a live MinIO) could never be resolved inside CI either, since no MinIO
existed there.
Resolution: `ci.yml` gained a `minio` service (same pinned tag as
`docker-compose.yml`), a bucket-creation step (`aws s3 mb` against it —
`ubuntu-latest` ships `aws-cli` preinstalled), `S3_*`/`AUTH_SECRET`/
`WEB_ORIGIN`/`RUN_LIVE_S3_TESTS` in the job env, a Playwright browser
install step, and an `E2E tests` step. New `apps/api/src/modules/rides/
route-storage.live.test.ts` exercises a real (unmocked) upload/download/
delete round trip through `route-storage.ts` — gated on
`RUN_LIVE_S3_TESTS=1`, not merely "are `S3_*` set" (a local `.env` has them
configured for MinIO whether or not MinIO is actually running, confirmed by
this session hitting exactly that false-positive locally before adding the
explicit flag). `apps/web/playwright.config.ts`'s `webServer` became a
two-entry array (`apps/api` then `apps/web`, Playwright's own supported
multi-server ordering since 1.34) since `/` has called the real `GET
/v1/rides` through `apps/web`'s rewrite since CR-024 — no longer a static
page a lone `next dev` could serve meaningfully. The pre-existing
`e2e/home.spec.ts` asserted on CR-002's bootstrap-placeholder copy, which no
longer exists anywhere in the app (`/` has been the real discovery screen
since CR-024) — rewritten to assert against the real page, tolerant of
either an empty or a populated rides list (a local dev database usually
isn't empty; CI's freshly migrated one is).
Live-verified in this session, not just reasoned about: ran `pnpm
test:e2e` locally end to end (both `apps/api` and `apps/web` started fresh
by the new two-webServer config, against this environment's real local
Postgres) — passed. Separately confirmed `route-storage.live.test.ts`
skips cleanly with no `RUN_LIVE_S3_TESTS` set (this environment's normal
state) and correctly attempts a real connection (failing, since no MinIO
runs here) when the flag is forced on — proving the gate itself works
before trusting it to guard CI's real run. The MinIO-service/CI-job
combination itself cannot be verified from this sandbox (no GitHub Actions
runner available here) — same category of gap as KI-043/KI-045's Docker
artifacts, not a new one.
Next action: none for this ticket. The still-missing critical-journey e2e
specs `.claude/rules/testing.md` names (discover+register, organizer
create+publish, view participants) are tracked as CR-092 — writing them was
out of this ticket's scope ("wire CI", not "write the e2e suite").

### KI-003 — Redis has no password, no persistence, no healthcheck

Resolved: 2026-09-18 (CR-077, "Redis hardening").
Discovered: 2026-09-11 (partly recorded earlier in project-state.md).
Problem: the local-dev `redis` service ran unauthenticated and without AOF
persistence. Its "no healthcheck" half was actually already stale by the time
this was reopened — CR-009/CR-010 (2026-09-13) had already added a
`redis-cli ping` healthcheck; the claim just never got corrected here.
Impact: on a server, an unauthenticated Redis is a takeover vector; without
AOF, a restart silently drops queued notification jobs (CR-050), which
contradicts `.claude/rules/resilience.md` (a failed background job must
never silently disappear).
Workaround: ports were already bound to `127.0.0.1`, containing the exposure
locally in the meantime.
Resolution: `docker-compose.yml`'s `redis` service gained `command:
redis-server --requirepass redis-dev-only --appendonly yes` (a literal
dev-only password, same pattern as this file's existing `postgres`/`minio`
credentials — the file is explicitly local-dev-only and bound to
`127.0.0.1`); its healthcheck now authenticates
(`redis-cli --no-auth-warning -a redis-dev-only ping`). `.env.example`'s
`REDIS_URL` updated to `redis://:redis-dev-only@localhost:6379` to match —
`ioredis` (`apps/api/src/redis.ts`) parses embedded credentials natively, no
application code change needed. `docker-compose.prod.yml` (ADR-018) still
runs no Redis of its own — a production `REDIS_URL` points at a real,
separately-provisioned instance, whose own operator owns its
password/persistence. `docker compose config` validated the new `command:`
line parses cleanly; Docker's daemon is still unreachable in this
environment (KI-019) so a live boot with real auth was not exercised.
`pnpm turbo run lint typecheck build test`: 29/29 tasks green, 299/299
`apps/api` tests passing (no application source touched by this ticket —
`queue.test.ts`/`health.test.ts` both fully mock `ioredis`, confirmed, so
their literal unauthenticated `REDIS_URL` fixture strings are unaffected).

### KI-040 — Notification delivery is a same-request DB insert, not a queued async job

Resolved: 2026-09-16 (CR-050, "Async notification delivery via Redis queue").
Discovered: 2026-09-16 (CR-038/039/040/041, "Communication" session).
Problem: `.claude/rules/resilience.md` says notification delivery "must run
outside the request/response cycle and outside the critical transaction" and
names Redis as the mechanism ("the side effect is queued (Redis) and processed
separately"). CR-050 ("Async notification delivery via Redis queue") is the
backlog ticket that actually builds that queue, and it is still open; Redis has
never been live-verified in this environment either (KI-014). This session's
three notification producers (`registration_confirmed` on register/promotion,
`ride_update` fan-out, `ride_cancelled` fan-out) instead insert directly into the
`notifications` table, in the same request, immediately after (never inside) the
triggering transaction — wrapped in `try`/`catch` so a failure is logged
(`request.log.error`) and swallowed, never surfacing as a failure of the
registration/update/cancellation endpoint that triggered it
(`.claude/context/current-task.md`'s scope decision).
Impact: low today — in-app notifications are a same-database insert, not a call
to an external provider (ADR-007 is explicit that the external-provider adapter
is a later step), so the specific resilience property that matters right now
("never let this side effect fail or roll back the critical action") is already
satisfied. What's missing is decoupling from the request/response cycle itself: a
slow or failing `notifications` insert still adds latency to the triggering
request (though it can never fail it), and a `ride_update`/`ride_cancelled`
fan-out to many registrants is one bulk multi-row insert per request rather than
individually-retryable queued jobs.
Workaround: none needed for correctness — every producer's own transaction
already committed before the notification insert runs, so a notification failure
never loses the registration/cancellation/update itself, only the notification
row.
Resolution: `apps/api/src/modules/notifications/queue.ts` (`registerNotificationQueue`)
wires a `bullmq` `Queue`/in-process `Worker`; all three producers now enqueue when
`app.notificationQueue` is configured (`REDIS_URL` set) instead of inserting directly,
with the previous direct-insert behavior kept as the fallback when it isn't (this
environment — KI-014 stays open). See `docs/changelog.md`'s CR-050 entry for the real
hang this session found and fixed while live-verifying against an unreachable Redis
(BullMQ's `add()`/`close()` calls can hang indefinitely with no bounded timeout of
their own — fixed with a hand-rolled `Promise.race` timeout, not
`callWithResilience`, since BullMQ accepts no `AbortSignal` to race against).
Next action: none for this ticket's own scope. Still owed (tracked by KI-014, not
this entry): live verification against a real, reachable Redis that an enqueued job
is actually consumed and inserted end to end by the worker — this session confirmed
the _unreachable_-Redis behavior (bounded, logged, never hangs), not the _reachable_
one.

### KI-039 — Ascending cursor pagination could get stuck on page one for a microsecond-precision timestamp column

Resolved: 2026-09-15 (CR-037, same session it was discovered in, before it ever
shipped). Discovered: 2026-09-15 (CR-037, "Organizer participant list" — the first
ticket to combine ascending cursor order with a `now()`-derived timestamp column).
Problem: `apps/api/src/lib/cursor.ts`'s established pattern encodes a page
boundary's `sortValue` from a JS `Date`'s `toISOString()` (millisecond precision),
then compares it against the raw DB column with `>`/`<` on the next page's query.
Postgres stores `timestamptz` at microsecond precision, so the truncated cursor is
always `<=` the row's actual stored value. For **descending** order (`/mine`'s
existing `<` comparison, `GET /v1/rides/mine`) this is harmless — a row's own
truncated cursor being `<=` itself makes its own `<` check come out false, as
intended. For **ascending** order, the row's own truncated cursor being strictly
less than its actual value makes that same row always satisfy its own `>` check —
with `ORDER BY ... ASC LIMIT n`, the smallest matching row is always itself, so
pagination would never advance past page one. Confirmed empirically against a real
Postgres (a temp-table insert + round-trip comparison in the same query) before
fixing, not just reasoned about — see `docs/changelog.md`'s CR-037 entry.
Impact: would have been silent and total for the two new endpoints this ticket
shipped (`GET /v1/rides/:id/participants`/`.../waitlist`, both `createdAt asc`) —
every "next page" request past the first would have returned the same first row
forever. The one pre-existing ascending case, `GET /v1/rides`'s `startsAt` sort
(CR-025), never triggered this: `startsAt` has no sub-second entropy (an
organizer-entered value), so its rows never sit close enough together in time to
expose the bug. `/mine`'s descending sort is immune by construction (see above).
Resolution: `registrations.service.ts`'s two new queries wrap the _column_ side of
the comparison in `date_trunc('milliseconds', ...)` too, so both sides are
truncated to the same precision consistently before comparing — a genuine tie at
millisecond precision still falls back to the `id` tiebreaker correctly. Scoped to
just these two new queries; `apps/api/src/lib/cursor.ts`'s general contract and
every existing consumer (`/mine`, `GET /v1/rides`) are untouched — neither needs
this fix today, per the reasoning above.
Next action: any future ascending-order collection endpoint sorted by a
`now()`-derived (or otherwise microsecond-precision) timestamp column must apply
the same `date_trunc('milliseconds', <column>)` treatment on the column side of its
cursor comparison — do not copy `/mine`'s descending pattern verbatim and assume it
transfers to ascending order.

### KI-R10 — Tailwind v4 never scanned `packages/ui` for utility classes

Resolved: 2026-09-13 (CR-065, same session it was discovered in). Discovered:
2026-09-13 (CR-065's live visual check).
Problem: Tailwind v4's automatic content detection only walks `apps/web`'s own
directory tree — it never crosses into a sibling monorepo package like `packages/ui`,
symlinked into `node_modules` or not. Every Tailwind utility class used exclusively
inside `packages/ui`'s components (`rounded-full`, `bg-bg-raised`, a flex `gap-*`
between a metric's value and unit, the tint/opacity classes on `StatusBadge`, ...) was
silently never generated: present correctly in the DOM's `class` attribute, but
`getComputedStyle` showed plain browser defaults (`border-radius: 0`,
`display: block` instead of `inline-flex`, etc.) — a class string in the markup with
zero effect.
Impact: would have made every one of `packages/ui`'s own Tailwind classes a silent
no-op the moment `apps/web` actually imported a real component (starting CR-011) —
exactly the kind of thing a jsdom unit test can't catch (no real layout/paint step).
Only found because CR-065's live visual check rendered a temporary showcase and
compared it against `docs/design.md`'s spec instead of trusting the DOM structure
alone.
Resolution: added `@source '../../../../packages/ui/src';` to
`apps/web/src/app/globals.css`, right after the existing `@import` lines. Re-verified
live (browser-automation skill, light + dark) after the fix — every component now
matches its `docs/design.md` spec exactly.
Next action: none — but worth remembering for any _future_ shared package
(`packages/maps-2gis`'s render layer, if one is ever added) that ships Tailwind
classes consumed by `apps/web`: it needs the same `@source` treatment, not just a
workspace `package.json` dependency.

### KI-R01 — Node 20 was end-of-life; toolchain versions inconsistent

Resolved: 2026-09-11 (CR-067). Node 20 reached EOL in April 2026 and was still pinned in
`.nvmrc`/`engines`; `packageManager` held an incomplete descriptor (`pnpm@10`) that
Corepack rejects and that made `pnpm/action-setup` receive the version twice. Now Node 24
LTS and `pnpm@10.34.5`.

### KI-R02 — Turborepo 2 strict env mode would have starved tasks of variables

Resolved: 2026-09-11 (CR-068). `turbo.json` declared no `globalEnv`/`env`, so builds and
tests would have run without `NEXT_PUBLIC_*`/`DATABASE_URL`, and the cache hash would not
have tracked environment changes.

### KI-R03 — Infrastructure ports published on all interfaces

Resolved: 2026-09-11 (CR-072). Postgres/Redis/MinIO were bound to `0.0.0.0`; now
`127.0.0.1`, with a comment in `docker-compose.yml` explaining why it must stay that way.

### KI-R04 — A single `NEXT_PUBLIC_` key for all 2GIS products

Resolved: 2026-09-11 (CR-071). Geocoder/Directions are billed per request and would have
shipped inside the browser bundle. Split into a public MapGL key and a server-only
`MAPS_2GIS_API_KEY`.

### KI-R05 — CI never ran the root ESLint config, and the workflow token was unrestricted

Resolved: 2026-09-11 (CR-067). `pnpm lint` only walks workspace packages, which do not
exist yet, so `eslint.config.mjs` was dead weight in CI. Added a `lint:root` step and
`permissions: contents: read`.

### KI-R06 — Node global types needed an explicit `"types": ["node"]` in some packages

Resolved: 2026-09-12 (CR-007, worked around 2026-09-12 in CR-004). Discovered:
2026-09-12. TypeScript's automatic `@types` inclusion (no explicit `"types"`
field) did not pick up `process`/`console`/`URL`/`import.meta.url` in
`packages/db/src/migrate.ts`, even though `@types/node` was correctly
installed and resolvable there — `tsc` reported
`TS2591`/`TS2304`/`TS2339`/`TS2584`. `apps/api` never hit this, apparently
because every file there already imports something from `fastify` (which
itself references Node builtin types), incidentally pulling `@types/node`
into the program; `packages/db`'s `migrate.ts` uses only bare Node globals
with no `node:`-prefixed import, so nothing forced the inclusion. CR-004
worked around it locally (`"types": ["node"]` in `packages/db/tsconfig.json`
only). CR-007 closed it properly: `packages/config/tsconfig/node-library.json`
bakes `"types": ["node"]` into the shared fragment every new Node-library
package (`packages/types`, `packages/maps-core`, `packages/maps-2gis`)
extends, so it can't be silently rediscovered per package again.
`apps/web`/`apps/api` were not retrofitted onto the shared fragment (neither
is currently failing; see the CR-007 changelog entry for why they're left
alone).

### KI-R07 — MinIO healthcheck used `curl`, which the server image does not ship

Resolved: 2026-09-13 (CR-009). Discovered: 2026-09-11.
Problem: the healthcheck shelled out to `curl -f http://localhost:9000/minio/health/
live`, but current `minio`/`quay.io` MinIO server images do not bundle `curl`, so the
container likely sat `unhealthy` forever regardless of whether the server itself was
fine.
Resolution: replaced with `mc ready local` — verified against MinIO's own official
`docker-compose.yaml` example (`minio/minio` GitHub repo,
`docs/orchestration/docker-compose/docker-compose.yaml`), which uses exactly this
healthcheck with no separate `mc` container, confirming `mc` is bundled in the server
image itself. Not live-verified in this environment (Docker's daemon is unreachable —
see KI-019); `docker compose config` confirms the healthcheck definition is syntactically
valid.

### KI-R08 — `minio/minio:latest` was unpinned

Resolved: 2026-09-13 (CR-009). Discovered: 2026-09-11.
Problem: `:latest` lets development/CI/server images drift apart silently.
Resolution: pinned to `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`. Switched the
registry too, not just added a tag to the Docker Hub image: MinIO's current official
docs (`docs/docker/README.md`, checked live) reference `quay.io/minio/minio`
exclusively now. The tag itself was verified to actually resolve via quay.io's registry
v2 manifest API (HTTP 200) before being used — the newest tag GitHub's releases API
reports (`RELEASE.2025-10-15T17-29-55Z`) returned 404 on quay's registry (not yet
mirrored there at the time of this task), so the newest tag that is actually resolvable
was pinned instead of the newest tag that merely exists upstream.

### KI-R09 — Pre-commit ESLint did not cover `apps/*`/`packages/*` staged files

Resolved: 2026-09-13 (CR-010). Discovered: 2026-09-12 (CR-002).
Problem: ESLint's flat config has no automatic directory cascading — one config file
wins per invocation, chosen by the process's working directory, not by the linted
file's own location. `turbo lint` runs each workspace's `lint` script with CWD inside
that package, so it correctly picks up that package's own config. But lint-staged's
pre-commit `eslint --fix` ran with CWD at the repo root, so it always used the root
config — which deliberately ignores `apps/**`/`packages/**` (so it doesn't wrongly lint
Next/JSX files with the bare root rules). Net effect: staged `apps/*`/`packages/*`
files were not ESLint-checked at commit time, only Prettier-formatted.
Resolution: root `package.json`'s `lint-staged` config now has one glob entry per
workspace member (`apps/web/**/*.{ts,tsx,js,jsx}`, `apps/api/**/*...`, one per
`packages/*`), each running `pnpm --filter <name> exec eslint --fix --no-warn-ignored`
instead of a single blanket rule. `pnpm --filter <name> exec` sets CWD to that
package's directory, which is what makes flat config resolve the package's own
`eslint.config.mjs` — confirmed lint-staged 15.5.2 passes **absolute** file paths to
task commands by default (its own docs), so this works regardless of which directory
the command's CWD is changed to. The old single-glob generic root entry was removed
(redundant once every workspace has its own scoped entry; there are zero non-workspace
top-level `.ts`/`.js` files in this repo).
Verified live, not just reasoned about: staged a real file in `apps/web` with an
intentional unused-variable violation. Before the fix (`eslint --fix` run from repo
root against the same absolute path): zero output, file silently skipped (ignored by
the root config's `apps/**` pattern). After the fix
(`pnpm --filter web exec eslint --no-warn-ignored`): the violation was correctly
reported by `apps/web`'s own Next.js-derived ruleset (`@typescript-eslint/
no-unused-vars`, a rule the generic root config also has, but crucially this proves the
_workspace-specific_ config — the one with Next/React rules the root config doesn't
carry at all — is now actually being applied to staged files). Test file reverted
immediately after; no test artifacts left in the working tree.
Two eslint.config.mjs files (root and `apps/web`) had comments explicitly describing
the old, now-incorrect behavior ("lint-staged does NOT reach this file") — updated
both rather than leaving a stale comment next to the code it used to accurately
describe.

### KI-R11 — `apps/api` never closed its Postgres connection pool on shutdown

Resolved: 2026-09-14 (CR-013, same session it was discovered in). Discovered:
2026-09-14 (CR-013's full-suite test run, once a fourth DB-touching Vitest
file — `users.routes.test.ts` — pushed concurrent `buildApp()` calls high
enough to surface it).
Problem: `apps/api/src/plugins/db.ts`'s `registerDb` created a `postgres.js`
connection pool (`createDbClient`) on every `buildApp()` call but never ended
it — Fastify's `onClose` hook was never registered for it, unlike every other
resource the app owns. Invisible with one or two Vitest files (few enough
concurrent `buildApp()` calls that the local scratch Postgres's
`max_connections` was never actually threatened), but a genuine, unbounded
leak: this session's fourth file added enough concurrent connections to
intermittently exhaust the pool, surfacing as unrelated `500`s on login
requests mid-suite.
Fix: `registerDb` now calls `app.addHook('onClose', () => db.$client.end())`
— `db.$client` is drizzle-orm's postgres-js driver exposing the underlying
`postgres.js` client instance. Verified live: `pg_stat_activity` connection
count no longer grows unbounded across repeated `pnpm --filter api test`
runs.
Also fixes a real (if previously unnoticed) production concern: a graceful
`apps/api` shutdown now actually drains its DB connections instead of relying
on the OS to eventually reclaim leaked sockets.

### KI-R12 — Concurrent Vitest files sharing one Postgres database deadlocked under load

Resolved: 2026-09-14 (CR-013, same session it was discovered in). Discovered:
2026-09-14 (CR-013's full-suite test run, after KI-R11's fix — still flaky).
Problem: every `apps/api` Vitest file runs its tests against one real,
shared local Postgres database, and each file's `beforeEach` does an
unscoped `DELETE FROM users` (the CR-012 fix for the original TRUNCATE
deadlock — see KI-R09's sibling entry in `docs/changelog.md`'s CR-012
section). That's safe within a file (tests run sequentially), but Vitest
runs different _files_ concurrently by default — this session's fourth
DB-touching file made two files' concurrent `DELETE FROM users` calls collide
with each other's in-flight register/login/patch requests often enough to
surface as intermittent genuine Postgres deadlocks/serialization failures
(returned to the client as unrelated `500`s), reproducible across 4 of 5
consecutive full-suite runs before the fix.
Fix: `apps/api/vitest.config.ts` now sets `test.fileParallelism: false` —
serializes test _file_ execution (each file's tests still run in whatever
order Vitest picks internally, sequentially either way) instead of trying to
scope every test's data by file, which the existing "wipe the whole table"
pattern isn't designed for. The suite is small enough (4 files, ~40 tests)
that this costs no meaningful wall-clock time (~5s either way). Verified
stable across 5 consecutive full-suite runs after the fix.
Note for future sessions: adding a fifth (or later) `apps/api` test file that
touches the DB does not reintroduce this risk — `fileParallelism: false` is a
suite-wide setting, not per-file.

### KI-024 — No `docs/tasks.md` ticket builds the organizer's "My rides" list

Resolved: 2026-09-14 (CR-088, its own new ticket — see this entry's own "Next
action" below, which is exactly what happened). Discovered: 2026-09-14
(CR-017).
Problem: `docs/design.md` §8 lists `/organizer/rides` ("My rides, grouped by
status") as a real screen in the organizer cabinet, but no CR ticket in the
Rides section (CR-017..CR-026) built it — CR-023 "Ride detail" is the
participant-facing `/rides/[id]` screen and CR-024 "Ride list" is the public
discovery list at `/`, not this one. CR-017 needed a nav entry point into ride
creation regardless, so `organizerRidesNavItem` ("Заезды") pointed straight at
`/organizer/rides/new` as a stopgap.
Impact: would have grown with every ride-related ticket landing without this
screen — CR-018 ("Edit draft") in particular would have had no way to
navigate to an existing draft through the UI once more than one existed.
Fix: added CR-088 to `docs/tasks.md`'s Rides section (first free CR number —
CR-001..CR-087 had no gaps) and built it in the same session as CR-016/CR-018,
before CR-018 shipped: `GET /v1/rides/mine` (first cursor-paginated collection
endpoint, `apps/api/src/lib/cursor.ts`) + `/organizer/rides` (groups the
caller's own rides by status, each card linking into CR-018's edit screen).
`organizerRidesNavItem` now points at the list instead of straight at the
create screen.

### KI-025 — No ticket transitions a ride into `registration_open`

Resolved: 2026-09-14 (CR-089, its own new ticket — the "add a preceding
ticket" option this entry's own "Next action" named, taken instead of folding
the transition into CR-020). Discovered: 2026-09-14 (CR-019).
Problem: `docs/product.md`'s Lifecycle is `draft → published →
registration_open → registration_closed → started → finished`, but
`docs/tasks.md`'s Rides section only had tickets for `draft → published`
(CR-019) and `registration_open/closed → ...` at the closing end (CR-020
"Close registration"). No ticket owned entering `registration_open` in the
first place — CR-019 was deliberately scoped to exactly what its name says
(`published`), not silently widened to also open registration, since neither
`docs/design.md` nor `docs/product.md` describes that as one combined action.
Impact: none while open — `registration_open` was unreachable, but nothing
consumed it yet either (CR-032 "Register" isn't built). Would have blocked
CR-020, which is exactly what surfaced it: `docs/tasks.md`'s next unchecked
Rides ticket had no reachable source state to transition out of.
Fix: added CR-089 ("Open registration") to `docs/tasks.md`'s Rides section
(same "real gap, add a ticket" pattern CR-088 used for KI-024) and built it in
the same session as CR-020, immediately before it: `POST
/v1/rides/:id/open-registration` (`published -> registration_open`, same
ownership rules as `publish`, no `emailVerified` gate) + `POST
/v1/rides/:id/close-registration` (`registration_open -> registration_closed`,
CR-020 itself). `/organizer/rides/[id]/edit` gained both actions as
status-conditional buttons, same pattern CR-019 established for "Опубликовать".

### KI-027 — No ticket transitions a ride into `started`

Resolved: 2026-09-15 (CR-090, its own new ticket, built together with CR-022
"Finish ride" — same "add a preceding ticket" pattern as KI-024/KI-025).
Discovered: 2026-09-15 (CR-022 session, checking the plan before implementing).
Problem: `docs/product.md`'s Lifecycle is `draft → published →
registration_open → registration_closed → started → finished`, but
`docs/tasks.md`'s Rides section had no ticket owning entry into `started` —
CR-021 ("Cancel ride") deliberately left it out of `CANCELLABLE_STATUSES` (per
`docs/product.md`'s Cancellation line), and CR-022 ("Finish ride") was the
next unchecked ticket with no reachable source state to transition out of.
Checked whether `started` might instead be an automatic (time-based)
transition rather than an organizer action before deciding this was a real
gap: `docs/product.md`'s organizer-capabilities bullet list doesn't name
"start" explicitly, but it also doesn't name "open/close registration"
explicitly (only "manage registrations and waitlist" generically), and those
turned out to be real, separate, organizer-triggered tickets (CR-089/CR-020)
— so the omission doesn't prove `start` is non-manual. No scheduled-job/cron
ticket or infrastructure exists anywhere in the repo that could drive an
automatic transition either.
Impact: none while open — `started` was unreachable, but nothing consumed it
yet either (no participant-facing feature reads ride status beyond the
`RIDE_STATUS_TERMS` label map). Would have blocked CR-022, which is exactly
what surfaced it.
Fix: added CR-090 ("Start ride") to `docs/tasks.md`'s Rides section and built
it in the same session as CR-022, immediately before it: `POST
/v1/rides/:id/start` (`registration_closed -> started`, same ownership rules
as every other transition, no `emailVerified` gate) + `POST
/v1/rides/:id/finish` (`started -> finished`, CR-022 itself). Reconfirmed by
a new test (not just inspection) that a `started` ride still correctly
rejects `POST .../cancel` with `409 ride_not_cancellable` — `CANCELLABLE_
STATUSES` was already correct from CR-021, this only exercises the path
first now that `started` is reachable. `/organizer/rides/[id]/edit` gained
"Начать заезд"/"Завершить заезд" buttons, no confirmation guard (unlike
`cancel` — both are forward-only steps with a further continuation in the
normal case).

### KI-028 — Ride detail is missing route/stops/services/requirements/registration

Status: open — narrowed 2026-09-15 (CR-024 closed the "no discovery entry
point" half). Discovered: 2026-09-15 (CR-023 session).
Problem: `docs/design.md`'s `/rides/[id]` spec names "Cover, metrics, route +
profile, stops, services, requirements, organizer, registration action" —
CR-023 could only build the pieces that have a real data model today (core
`Ride` fields + the organizer's name). `Route`/`Stop`/`RideRequirement`/
`RideService` have no tables (CR-027..031, `RideRequirement`/`RideService`
don't even have CR numbers yet — KI-021's sibling gap) and `Registration`
doesn't exist either (CR-032+), so there is no registered-participant count
and no register/cancel action on the screen.
Impact: none today — the screen is reachable and correct for what exists;
these are gaps to close by later tickets, not defects in this one.
Workaround: none needed — every field CR-023 does show reflects real,
current data; the screen omits what it can't yet know rather than showing
a fake placeholder.
Next action: CR-027..031 add route/stops/services/requirements to the
screen; CR-032..036 add the registered-participant count and register/
cancel action.
Update 2026-09-15 (CR-024): resolved the other half of this issue — `/`
(Discovery) now lists every published+ ride as a `RideCard` linking into
`/rides/[id]`, so a participant no longer needs a direct link to reach it.

### KI-029 — Discovery list isn't ordered by upcoming-soonest, and past rides aren't segregated

Status: resolved 2026-09-15 (CR-025, "Filters" — the "next action" this
entry itself named). Discovered: 2026-09-15 (CR-024 session).
Problem: `GET /v1/rides` (and `apps/web`'s `/` built on top of it) sorts
`(createdAt desc, id desc)` — the same cursor key `/mine` (CR-088) already
used, reused as-is for simplicity. A discovery feed's more useful ordering
would be "soonest-upcoming ride first", ideally with already-`finished`/
`cancelled` rides (past `startsAt`) segregated from what's actually joinable.
Considered `startsAt asc`/`desc` while building this ticket: `asc` puts old
past rides _before_ upcoming ones on page 1 (actively wrong); `desc` is
directionally better (all future rides precede all past ones) but still
shows the furthest-future ride first, not the soonest. Excluding/reordering
around "now" is a real filtering decision with no product-doc backing yet.
Impact: low today — very few rides exist in any environment this ticket
would be tested against, so `createdAt desc` and "upcoming first" mostly
coincide by accident. Will matter once the list has enough rides spanning
past and future.
Resolution: `listPublicRides` now makes "upcoming" (`startsAt >= now`,
computed fresh per call) an unconditional part of the endpoint — not a
toggleable filter, since no use case for browsing past rides from `/` was
ever named (`docs/product.md` Principle 3, "Live status, not stale
coordination"). With past rides excluded outright, `startsAt asc`
(soonest-first) is now the correct default sort — the `apps/api/src/lib/
cursor.ts` `CursorKey` field was generalized from `createdAt` to the
neutral `sortValue` so `/mine` (still `createdAt desc`) and `/` (now
`startsAt asc`) can share the same opaque-cursor machinery on two
different columns. Live-verified: a published ride with a 2020 `startsAt`
never appears in `GET /v1/rides`, and two future rides created out of
chronological order still return soonest-first.

### KI-030 — Discovery only filters by bicycleType; distance/difficulty/price/date-range filters are deferred

Status: open. Discovered: 2026-09-15 (CR-025 session).
Problem: `docs/tasks.md`'s "CR-025 Filters" ticket and `docs/design.md`'s
`RideFilters` component name filtering generically, with no field list.
Of `Ride`'s fields, `bicycleType` is the only one that's both always-set
(required since CR-017) and a small closed enum — the rest
(`distanceKm`/`difficulty`/`priceRub`/`startsAt` as a range rather than the
unconditional "upcoming" floor KI-029's resolution added) are nullable and
would each need real range-picker UI with no design-doc backing.
Impact: low — the shipped `bicycleType` filter is real and correct for what
it covers; a participant cannot yet narrow by distance/difficulty/price/a
specific date range.
Workaround: none needed — browsing the full (already upcoming-only)
list and reading each `RideCard`'s metrics is the fallback.
Next action: add distance/difficulty/price/date-range filters to
`RideFilters` if/when the product spec names them — same "the minimal real
thing now" discipline this ticket itself used, not an oversight to fix
blindly.

### KI-031 — No live 2GIS MapGL rendering yet; `/`'s map view is a degraded placeholder

Status: narrowed 2026-09-20 (CR-098, ADR-020) — the discovery half is resolved;
the route-detail half stays open, folded into KI-036 (below) rather than kept
here, since building it is now purely "extend the same `MapRenderer` to a
second surface", not "no render layer exists at all". Previously widened
2026-09-15 (CR-028, "Route rendering"): `/rides/[id]`'s new route map section
hit the identical gap, same reasoning, second surface. Discovered: 2026-09-15
(CR-026, "Map discovery" session).
Problem: no `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` is configured anywhere in this
environment (`.env.example` only — grepped `apps/web/src`, no matches), so a
real 2GIS MapGL JS integration could not be built and live-verified this
session — unlike `packages/maps-2gis`'s geocode adapter (KI-016), there is no
way to mock "does a vendor map tile actually render in a browser".
`.claude/CLAUDE.md`'s stop conditions ("the failure depends on an unavailable
external service/credential") apply directly.
Impact: medium — `/`'s "Карта" tab (CR-026's `DiscoveryViewToggle`) always
shows `RideMapPlaceholder` (`ErrorState`, `tone="warning"`, `variant="inline"`
— `.claude/rules/resilience.md`'s required degraded-state pattern) instead of
an actual map, regardless of whether any ride has coordinates. The list view
is fully unaffected. Update 2026-09-15 (CR-028): `/rides/[id]`'s new "Маршрут"
section shows its own independent `RouteMapPlaceholder` instance
(`features/participant/ride-detail/`, not shared with discovery's — per
`.claude/rules/extensibility.md`'s feature-boundary rule) for the same
reason. The elevation profile half of that same section does not need 2GIS
and ships as a real, live-verified chart (resolves KI-035).
Workaround: none needed for the list-based discovery journey or for a ride's
elevation profile — neither placeholder blocks anything, per its own design.
Next action: none for the discovery half — done. See the route-detail
follow-up under KI-036.
Update 2026-09-20 (CR-098, ADR-020): user supplied a real public
`NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`. Built the render layer this entry
described: `packages/maps-core/src/render.ts` (`MapRenderer`/`MapHandle`/
`MapMarkerInput`/`MapRenderOptions`) and `packages/maps-2gis/src/render.ts`
(real `@2gis/mapgl` SDK, dynamically imported, browser-only). New
`DiscoveryMap` component replaces `RideMapPlaceholder` on `/`, plotting each
published ride's `startLat`/`startLng`; falls back to the same placeholder on
a missing key or a failed render. Live-verified in a real headless browser:
`keys.api.2gis.com` key validation, `styles.api.2gis.com` style fetch, and
ten `tile*-sdk.maps.2gis.com` vector tile requests all real `200`s; three
marker `<svg>` elements at three distinct screen positions matching three
seeded published rides; zero console errors. The route-detail placeholder
(`RouteMapPlaceholder`) is untouched — see KI-036.

### KI-032 — No geocode-by-address UI; ride coordinates are entered manually

Status: open. Discovered: 2026-09-15 (CR-026, "Map discovery" session).
Problem: `PATCH /v1/rides/:id`'s new `startLat`/`startLng` fields (CR-026)
are plain number inputs in `EditRideForm` — there is no address-to-
coordinates lookup UI, because building one on top of `packages/maps-2gis`'s
geocode adapter would be new code with no way to verify it actually works
against a live 2GIS account (KI-016 — no credential configured).
Impact: low-medium — an organizer must already know (or look up elsewhere)
their ride's start coordinates to fill in the field; this is the
`.claude/rules/resilience.md`-required "ride can still be created/viewed
without geocoded coordinates" path, just made the _only_ path for now rather
than a fallback for a failed geocode call.
Workaround: manual entry, or leave both fields blank (the ride stays fully
usable — it just won't appear in a bbox-filtered/map query).
Next action: once KI-016 is resolved (a live geocode credential exists),
wire `EditRideForm` to call `packages/maps-2gis`'s `geocode()` and offer a
"find on map"/address-search affordance instead of raw lat/lng inputs.

### KI-033 — A ride's finish point has no coordinates (start point only)

Status: open. Discovered: 2026-09-15 (CR-026, "Map discovery" session).
Problem: `docs/product.md`'s Ride fields list names "start, finish" directly
on `Ride`. CR-026 (ADR-014) only added `startLat`/`startLng` — a discovery
map only ever needs one pin per ride (where it begins), and no named use
case shows a finish pin on the discovery map.
Impact: low — nothing in scope today needs a finish point; a future ride-
detail map or route-summary screen might.
Workaround: none needed.
Next action: add `finishLat`/`finishLng` (same ADR-014 shape) if/when a
screen actually needs to show or query by the finish location — likely
alongside CR-027..031 (`Route`/`RoutePoint`), not before.

### KI-037 — No ticket builds a participant-facing "My registrations" list

Resolved: 2026-09-16 (CR-091, its own new ticket — exactly what this entry's own
"Next action" named). Discovered: 2026-09-15 (CR-032, "Register" session).
Problem: `docs/product.md` names "view registered rides" as a participant
capability, and `docs/design.md` §8 lists `/me/rides` ("My registrations",
upcoming/past tabs) in the cabinet screen inventory — but `docs/tasks.md`'s
Registration section (CR-032..037) never owned building it, the same shape of
gap as KI-024 ("My rides", organizer side)/KI-025/KI-027.
Impact: was low — a participant could always see and cancel an active
registration by revisiting the specific ride's `/rides/[id]` page, just not via
a single list of everything they'd registered for.
Fix: `GET /v1/registrations/mine?when=upcoming|past` (own `/v1/registrations`
prefix, a new `myRegistrationsRoutes` plugin in the same `registrations`
capability module) — the caller's own active registrations, two independently
cursor-paginated tabs, joined with each ride's public+organizer summary. `/me/
rides` (`MyRidesView`, Upcoming/Past tabs, `MyRideCard`), a second entry in the
participant cabinet nav registry. Read-only — cancellation stays on
`/rides/[id]`, not duplicated here. Waitlist entries deliberately out of scope
(no doc names them for this screen). Live-verified via curl against a real
Postgres + `apps/api`: an upcoming and a past-dated ride each land in the
correct tab, no session → `401`, missing `when` → `400`. See
`docs/changelog.md`'s CR-091 entry.

### KI-041 — CR-052 closes on reactive degraded-state handling, not a proactive `/health` banner

Resolved: 2026-09-17 (CR-052, "Frontend degraded-state handling" — the scoping
decision this entry records). Discovered: 2026-09-16 (CR-050's changelog entry
speculated CR-052 would be "a natural consumer of [`/health`]'s `dependencies`
detail," i.e. a global banner driven by polling `GET /health`).
Problem: that CR-050 note created an implicit expectation that was never backed
by `docs/design.md`. §10 (the actual spec for CR-052) names exactly two
degraded cases — an inline notice on the map area when 2GIS is unavailable, and
"Загрузка недоступна" on the upload control when S3 is unavailable — both
reactive, per-call, and both already built (opportunistically, during
CR-026/027/028) before CR-052 was picked up as its own ticket. Nothing in the
product docs asks for a global "backend is degraded" banner.
Impact: none functionally — this is a scope-boundary clarification, not a bug.
Left unrecorded, a future session could read the CR-050 note as still-open
scope and build a `/health`-polling banner nobody asked for, or conversely
keep treating CR-052 as blocked on it.
Resolution: CR-052 is closed on the reactive, per-call handling alone (already
real, now with a symmetric `replaceRoute` degraded-path test added alongside
the existing `uploadRoute` one). `apps/web` does not call `GET /health`
anywhere, deliberately.
Next action: none for CR-052 itself. If a real product need for a proactive
degraded-backend banner shows up later, it needs its own `docs/design.md`
update first (what it looks like, which pages show it, how often it polls) —
treat that as new scope, not a reopening of this ticket.

### KI-002 — Migration execution during deploy is undefined

Status: resolved 2026-09-17 (CR-076). Discovered: 2026-09-11.
Problem: nothing said who runs migrations on the server, and — the part that
turned out to be real, not just theoretical — `packages/db/src/migrate.ts`'s
use of drizzle-orm's postgres-js migrator was never actually safe under
concurrent invocation. Confirmed live before fixing anything: two
`pnpm db:migrate` processes launched at the same instant against a fresh
database reliably raced — one failed with `duplicate key value violates
unique constraint "pg_namespace_nspname_index"` on `CREATE SCHEMA IF NOT
EXISTS "drizzle"`, because drizzle's migrator reads the last-applied
migration and applies missing ones inside one transaction, but never
serializes that read+apply across separate processes.
Resolution: `packages/db/src/migrate.ts` now wraps the whole migrate() call
in a session-level Postgres advisory lock (`pg_advisory_lock`/
`pg_advisory_unlock`, fixed arbitrary key), using the same `{ max: 1 }`
client for the lock and the migration (a `client.reserve()` connection was
tried first for an explicit same-session guarantee, but drizzle's
postgres-js driver reaches into `client.options` for type-parser setup,
which a reserved connection doesn't expose — `drizzle(reserved)` threw at
construction, so the simpler `max: 1` approach was kept instead). Re-ran the
identical concurrent-launch test after the fix: both processes now exit `0`
— the second one's log shows Postgres `NOTICE`s ("schema \"drizzle\" already
exists, skipping") proving it waited for the lock, found nothing left to do,
and completed as a clean no-op instead of racing. A new `packages/db/Dockerfile`
plus `docker-compose.prod.yml`'s `migrate` service (gated behind the `migrate`
Compose profile, never started by a plain `docker compose up`) give this an
actual explicit-deploy-step home in the production manifest.
Next action: none — CR-076 is the ticket this pointed at, and it's done.

### KI-006 — No observability

Status: resolved 2026-09-17 (CR-079). Discovered: 2026-09-11.
Problem: no structured logging, request ids, error reporting, or metrics were
specified. `.claude/rules/resilience.md` requires background job failures to
be visible; there was no mechanism that could make them visible.
Resolution: `apps/api/src/lib/request-id.ts` (`generateRequestId`) reuses a
valid inbound `X-Request-Id` or generates one, wired into `app.ts` as
Fastify's `genReqId`; the response echoes it back. `app.ts`'s pino config
gained `base: { service: 'api' }`. New `apps/api/src/plugins/
error-reporting.ts` decorates `app.reportError(error, message, context?,
logger?)` — always logs structurally (the mechanism that alone makes a
failure "visible"), and optionally forwards to a webhook sink via
`ERROR_REPORTING_WEBHOOK_URL` (a generic seam, not a specific vendor SDK —
no error-tracking provider is decided yet, same as this ticket's own
Investigation notes). `error-handler.ts`'s unexpected-500 branches and
`queue.ts`'s job-failed-after-retries handler both now go through this one
funnel. Metrics/tracing remain out of scope, unchanged from ADR-016's
original "add when actually needed" stance.
Next action: none for observability's request-id/error-visibility half.
Picking and wiring a real error-tracking vendor is a future ticket once one
is actually chosen — not reopening this one.

### KI-046 — `docker-compose.prod.yml` passes unset optional env vars as empty strings

Status: resolved 2026-09-19 (CR-081). Discovered: 2026-09-17 (CR-079).
Problem: `docker-compose.prod.yml`'s `api` service wires every optional env
var through `${VAR}` unconditionally (`REDIS_URL`, `S3_ENDPOINT`, and
`ERROR_REPORTING_WEBHOOK_URL`). Compose substitutes an empty string, not an
absent variable, for one left unset in `.env` — confirmed live via `docker
compose ... config`. A bare `z.string().url().optional()` in `apps/api/src/
env.ts` rejects an empty string (only `undefined` counts as absent), which
would crash `apps/api` at boot.
Impact: deploying with `REDIS_URL`/`S3_ENDPOINT` genuinely unset (a
legitimate degraded-mode configuration the code otherwise supports) crashes
the API process in production instead of booting in the documented degraded
mode.
Resolution: `ERROR_REPORTING_WEBHOOK_URL` was fixed first (CR-079) via a
`z.preprocess` that normalizes `''` to `undefined` before validation.
CR-081 applied the identical `z.preprocess` shape to `REDIS_URL` and
`S3_ENDPOINT` — the only other two `.url().optional()` fields (the
remaining `S3_*` fields are plain `z.string().optional()`, which already
accepts `''` without crashing). New `apps/api/src/env.test.ts` covers the
empty-string-to-undefined normalization for both, plus the existing
production-placeholder-refusal behavior, so this stays a tested contract
rather than only exercised indirectly.
Next action: none.

### KI-047 — Local `.env`'s `DATABASE_URL` diverges from `.env.example`, and stale `pnpm dev` processes accumulate across sessions

Status: open. Discovered: 2026-09-19, first time Docker Desktop actually
worked in this environment and `pnpm dev` was run end to end for manual
browser verification.
Problem: two separate issues surfaced together.

1. This checkout's `.env` had `DATABASE_URL=postgresql://glebchurkin@
localhost:5432/coffee_ride_dev` (a native Homebrew `postgresql@14`
   instance, no container), not `.env.example`'s documented
   `postgresql://postgres:postgres@localhost:5432/coffee_ride` (the
   `docker-compose.yml` Postgres). This isn't a typo — `docs/changelog.md`
   has dozens of prior entries citing the exact same native connection
   string, and the native database already holds real accumulated dev data
   (22 users, 13 rides, 7 registrations at time of discovery). Docker's
   Postgres was previously unreachable in this environment (Docker Desktop
   itself didn't start — see `docker-desktop-unavailable` project memory),
   so all real local development has been happening against the native
   instance instead, and `.env` was never brought back in line with the
   template.
2. Multiple `turbo dev`/`tsx watch`/`next dev` process trees from earlier,
   unrelated sessions (going back to Thu 21:00 and 22:29) were still running
   in the background, one of them holding port 4000. A fresh `pnpm dev`
   this session failed with `EADDRINUSE` until all stale trees were found
   (`ps aux | grep coffeeride`) and killed manually.
   Impact: a session that blindly follows `.env.example`/`docker compose up -d`
   gets a fresh, empty database and diverges from the real dev data this
   developer has been using — and a session that just runs `pnpm dev` without
   checking for prior background processes first can silently fail to bind its
   port, or silently talk to a stale zombie API instance instead of its own.
   Workaround: before running `pnpm dev`, check `ps aux | grep coffeeride` (or
   `lsof -nP -iTCP:3000 -iTCP:4000 -sTCP:LISTEN`) for leftover processes from
   earlier sessions and kill them first. Confirm which `DATABASE_URL` `.env`
   actually points at before assuming it matches `.env.example` — ask before
   changing it, since (as happened this session) the "wrong-looking" native
   value may be the real one with real data, not a mistake to fix. On a fresh
   MinIO volume, the `coffee-ride` S3 bucket also does not exist yet and must
   be created once (`docker exec <minio-container> mc mb local/coffee-ride`
   after `mc alias set local http://localhost:9000 minio minio12345`) —
   nothing in this repo auto-creates it.
   Next action: consider either (a) a `predev`/setup script that checks for
   stale ports and creates the MinIO bucket idempotently, or (b) reconciling
   `.env`/`.env.example` deliberately (e.g. migrating the native Postgres data
   into the Docker Postgres, or updating `.env.example` to document the native
   option too) so this doesn't need rediscovering every session. Recommended:
   run `/run-skill-generator` to capture the working local-run procedure
   (port-conflict check, correct `DATABASE_URL`, MinIO bucket bootstrap) as a
   project skill under `.claude/skills/`, per the `run` skill's own guidance.

### KI-016 — 2GIS Geocoder/Routing response parsing is unverified against a live API

Resolved: 2026-09-19 (CR-093, "Connect live 2GIS Geocoder/Directions key").
Discovered: 2026-09-12 (CR-007).
Problem: `packages/maps-2gis`'s field names (`point.lat`/`lon`, `full_name`,
`distance`/`duration`, route geometry) came from 2GIS's public documentation
and search results, not a real request/response — no `MAPS_2GIS_API_KEY` was
configured in this environment, and `.claude/rules/maps.md` itself deferred
that verification to "before production integration."
Impact: was low before this session (zero consumers — KI-017's same "not
wired in yet" point still applied: no route/use case calls this adapter
yet), but the bug found while resolving this was real and would have
shipped silently — every route render would have drawn a straight line
between waypoints instead of the actual road/path geometry, with no error
to signal it.
Workaround: none needed — fixed at the root.
Resolution: a live server-side key (Geocoder/Directions product, never the
public MapGL one — CR-071) was added to local `.env` and exercised directly
against `create2GisMapProvider` with real requests (a Red Square geocode, a
reverse-geocode, and a cycling route from Red Square to Gorky Park).
`geocode`/`reverseGeocode`'s `point.lat`/`point.lon`/`full_name` guesses
were exactly right. `getRoute`'s `total_distance`/`total_duration` guess was
right, but the geometry guess was wrong: the real polyline is not a flat
`geometry` array of `{lat, lon}` — it's spread across `maneuvers[].
outcoming_path.geometry[]`, each a WKT `LINESTRING(lon lat, lon lat, ...)`
string, which the adapter had never parsed, so it silently fell back to the
requested waypoints on every call. Fixed in `packages/maps-2gis/src/
route.ts` (new `parseWktLineString`, rewritten `extractGeometry`);
`provider.test.ts`'s route geometry fixture updated to the verified real
shape. Typecheck/lint/tests/build all green after the fix; re-ran the live
call afterward and confirmed a real multi-point polyline comes back instead
of the two-point fallback. See `docs/changelog.md`.
Next action: none for this adapter itself. The next real step is wiring an
actual consumer (KI-032's geocode-by-address UI, or CR-028/CR-084's route
rendering) now that a live credential exists and the adapter is verified —
see also KI-031 (MapGL browser rendering is still blocked on a separate,
not-yet-provided `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`).

### KI-052 — Dark theme tokens existed but nothing ever activated them

Resolved: 2026-09-20 (CR-099, a user-run QA pass against a live browser).
Discovered: 2026-09-20 (same session).
Problem: `packages/ui/src/tokens.css` has defined a full `.dark` token set
since CR-063, and `docs/design.md` states "dark theme is not optional or
later." But no code anywhere ever applied the `.dark` class, and there was
no `prefers-color-scheme` media query either — emulating a dark system
preference left the page fully light.
Impact: medium — a real requirement from the design doc was silently
unimplemented since CR-063; anyone using the app before dawn/after dusk got
the light theme regardless of their OS setting.
Resolution: `apps/web/src/app/layout.tsx` now injects a `next/script`
`beforeInteractive` inline script that adds `.dark` to `<html>` when
`window.matchMedia('(prefers-color-scheme: dark)').matches` — runs from the
initial HTML, before hydration/paint, so there's no flash of the wrong
theme. No manual toggle: `docs/design.md` never requires one, only that the
theme exists and responds to the system preference. Live-verified in a real
browser with `page.emulateMedia({colorScheme: 'dark'})`:
`document.documentElement.className` gains `dark`, and `body`'s computed
background flips from `rgb(250, 249, 247)` (`#faf9f7`, the light token) to
`rgb(23, 22, 20)` (`#171614`, the dark token) — an exact match to
`tokens.css`'s values, confirmed on both `/login` and light mode's default.
Next action: none. A manual override toggle remains a reasonable future
enhancement (out of this fix's scope) if a real user asks for one.

### KI-053 — No shared nav/header on `/`, `/register`, `/login`

Resolved: 2026-09-20 (CR-099, a user-run QA pass against a live browser).
Discovered: 2026-09-20 (same session).
Problem: none of these three screens linked to each other or into a
cabinet. From `/register` there was no path back to `/login` (or vice
versa), and `/` had no way into a cabinet without typing a URL — the only
link on any of the three was 2GIS's own map attribution.
Impact: medium — a real, if unglamorous, UX dead end on the app's own
entry points.
Resolution: new `SiteHeader` (`apps/web/src/components/site/SiteHeader.tsx`,
a plain Server Component — no client state needed), applied via a new
`(public)` route group (`apps/web/src/app/(public)/layout.tsx`) wrapping
exactly `/`, `/register`, `/login` (moved into the group, same routes,
no URL change) — deliberately scoped to just these three, not
`/organizer/*`/`/me/*` (already have `CabinetShell`'s own nav) or
`/rides/[id]` (not part of the reported gap). Static by design: shows
Заезды/Войти/Регистрация/Личный кабинет links unconditionally rather than
fetching the session just to decide what to show — `/me` already redirects
a logged-out visitor to `/login` (`CabinetShell`), so this needs no new
client-side auth check. Also added direct cross-links inside the forms
themselves: `RegisterForm` → `/login`, `LoginForm` → `/register` and
`/forgot-password`. New terms in `packages/ui/src/terminology.ts`
(`SITE_HEADER_TERMS`, `AUTH_TERMS.loginLink`/`registerLink`/
`forgotPasswordLink`), per `.claude/rules/frontend.md` — no hard-coded
Russian strings in the component. Live-verified in a real browser: `/`,
`/login`, `/register` all render the header with all five links resolving
to the right routes; zero console errors, zero failed requests.
Next action: none.

### KI-054 — Organizer ride sub-routes (edit/route/cover/participants/updates) showed nothing during navigation before their own skeleton mounted

Resolved: 2026-09-20 (CR-099, a user-run QA pass against a live browser).
Discovered: 2026-09-20 (same session).
Problem: `EditRideForm`/`RouteUploadForm`/`CoverImageUploadForm` each
already render a `Skeleton` once they mount and start their own data fetch
— but the App Router had no `loading.tsx` boundary for
`/organizer/rides/[id]/*`, so during the RSC navigation itself (fetching
and rendering the new route segment) the browser showed nothing changing
at all until that payload arrived — reported as "~2-3.5s with only the
static `<h1>` visible, no skeleton, looks like a hung page."
Impact: low-medium — no functional break (the page always did load), but a
real perceived-hang UX gap on some of the most-used organizer screens.
Resolution: `apps/web/src/app/organizer/rides/[id]/loading.tsx` (new) — one
shared Next.js loading boundary covering every leaf under that segment
(`edit`, `route`, `cover`, `participants`, `updates`), reusing the same
`Skeleton` shapes each leaf's own client component already renders once
mounted. This complements, not duplicates, the existing per-form skeletons
— it covers the gap before hydration/mount, they cover the gap during the
client-side re-fetch after a mutation.
Next action: none. The same gap likely exists on other dynamic-segment
routes without their own `loading.tsx` (not audited here — out of this
fix's reported scope); worth a pass if it comes up again elsewhere.

### KI-059 — The rider list has no avatars

Resolved: 2026-09-24 (CR-126).
Discovered: 2026-09-23 (CR-119).
Problem: «Участники» on `/rides/[id]` (`GET /v1/rides/:id/riders`) shows display
name + group only. There is no public per-user avatar endpoint — only
`/v1/users/me/avatar` and `/v1/organizers/:id/avatar` — and `project-state.md`'s
"Do not break" deliberately keeps `users` free of a public-by-id pattern without
a product reason.
Impact: low — the list works; it is just plainer than the rest of the page.
Workaround: none.
Next action (as originally written): product decision first (is a participant's
avatar public to other signed-in users?). If yes, add a scoped avatar path for
riders of a ride (no user ids in the payload, same privacy rule as the riders
endpoint) — a security-review item, not a UI tweak.
Resolution: the product decision landed as CR-126's full participant-profile
feature, following exactly the shape this note called for. `GET /v1/rides/:id/
riders/:registrationId/avatar` streams a rider's avatar, gated by the same
`resolveRiderAccess` tier logic as the new profile endpoint — never a bare
`GET /v1/users/:id`, no user id in the `/riders` payload (only an opaque
`registrationId`, added additively). See `docs/decisions.md`'s new ADR and
`docs/changelog.md`'s CR-126 entry for the full design.

### KI-067 — `e2e/home.spec.ts` expects the map/list view on `/`, which defaults to the grid since CR-130

- Status: open, discovered 2026-09-26 (CR-132's e2e run; unrelated to CR-132).
- Problem: the spec (last changed in CR-118, `c685310`) opens `/` and waits
  for `data-testid="discovery-list-panel"`, but CR-130's «Заезды/Карта» tabs
  made the `RouteCover` grid the default and mount the list only at
  `/?view=map` — the panel never appears and the test times out.
- Impact: the e2e suite has one red test on `main`; the discovery screen
  itself works (browser-checked; `critical-journeys.spec.ts` 3/3 green).
- Workaround: run `critical-journeys.spec.ts` alone.
- Next action: point the spec at `/?view=map` (or split it into a grid-view
  and a map-view check). Also: back-to-back local e2e/fixture runs trip the
  `/v1/auth/*` rate limit (KI-014) — rerun after a minute.
- Resolution 2026-09-26 (CR-133): the spec checks the default grid on `/`
  and the map-view list on `/?view=map`; e2e 5/5 against the dev stack.

### KI-043 — CR-074's two Dockerfiles have never had a real `docker build` run against them

Status: open. Discovered: 2026-09-17 (CR-074).
Problem: same root cause as KI-019 — the Docker daemon does not come up in this
environment (`docker info` confirmed still unreachable this session). CR-074 added
`apps/web/Dockerfile` and `apps/api/Dockerfile`, both multi-stage with a non-root
runtime user, but neither has had an actual `docker build`/`docker run` executed
against it.
Impact: medium — the Dockerfiles are new and unexercised as container images
specifically (as opposed to the underlying mechanics they depend on, which were
verified directly on the host — see Workaround). A mistake specific to the
containerized environment (a missing system package, a base-image path/permission
issue, a COPY that only looks right) would not be caught until the first real build.
Workaround: could not build the images, so instead verified the pieces a Docker
build would exercise, directly on the host, and did not just assume they'd work:
(1) added `output: 'standalone'` to `apps/web/next.config.ts` and ran a real `pnpm
--filter web build`, then inspected the actual `.next/standalone` output shape
(confirmed the `apps/web/server.js` entry path and that `.next/static`/`public`
need copying separately — both now match what the Dockerfile actually does); (2)
for `apps/api`, ran the exact `pnpm --filter=api deploy --prod` command the
Dockerfile's builder stage runs, then ran `node dist/server.js` from inside that
pruned output directory against this environment's real local Postgres — `GET
/health` responded `200`, proving the pruned, production-only `node_modules`
(no devDependencies) is actually sufficient and argon2's native binding still
resolves correctly from within it.
Update 2026-09-22: the Docker daemon is reachable this session (`docker info`
succeeds, `docker compose up -d` brings up postgres/redis/minio healthy — same
daemon used for CR-097 live verification). Ran `docker build -f apps/api/
Dockerfile .`; it fails before any of this repo's own build steps run, while
resolving the `node:24-alpine` base image: BuildKit (and, tried as a fallback,
the legacy `DOCKER_BUILDKIT=0` engine) cannot resolve DNS for
`production.cloudfront.docker.com` (Docker Hub's blob-storage CDN) from inside
Docker Desktop's own Linux VM — confirmed reproducible (3/3 attempts) with
`docker run --rm redis:8-alpine getent hosts production.cloudfront.docker.com`
(`rc=2`), while `registry-1.docker.io` and `google.com` resolve fine from the
same container — so this is one specific domain blocked at the network/DNS
level this sandbox sits behind, the same class of restriction already tracked
as KI-055 for `unisender.ru`, not a general Docker/network outage. Already-cached
base images (`postgres:17-alpine`, `redis:8-alpine`, `quay.io/minio/
minio:...`) pull/run fine since no new blob fetch through that CDN is needed;
`node:24-alpine` (and likely any other not-yet-cached Docker Hub image) is not
cached locally and cannot be pulled. `apps/web`'s Dockerfile was not attempted
separately — it depends on the same `node:24-alpine` base and would fail
identically at the same step.
Next action: unchanged in substance — still needs a session where this specific
CDN domain resolves (or `node:24-alpine`/`docker/dockerfile:1` are pre-pulled
some other way, e.g. `docker save`/`docker load` from a machine that can reach
it) before `docker build` can be exercised at all here. Not a code fix; no
Dockerfile change is implicated by this failure.
Resolution 2026-09-26 (CR-134): all three images (`api`, `web`, `migrate`) now
really build and run — `deploy/smoke/run.sh` builds them from
`docker-compose.prod.yml`, applies migrations, and gets `200 {"items":[],
"nextCursor":null}` for `GET /api/v1/rides` through `web`. The first real run
found one real Docker-specific bug (web proxied to `localhost:4000`, fixed in
CR-134). The CDN block itself persists here: base images were pulled from
Google's Docker Hub mirror and retagged locally (`docker pull mirror.gcr.io/
library/node:24-alpine && docker tag … node:24-alpine`, same for
`docker/dockerfile:1`). CI's `docker-smoke` job pulls from Docker Hub directly.

### KI-050 — `turbo.json`'s `test` task doesn't pass through `TEST_DATABASE_URL`

Status: open. Discovered: 2026-09-20 (CR-097 session), while running the full
monorepo check sweep (`pnpm turbo test`) after CR-095/KI-049 added
`TEST_DATABASE_URL` as the variable `apps/api`'s test suite actually reads.
Problem: `turbo.json`'s `test` task declares an explicit `env` allowlist
(`NEXT_PUBLIC_*`, `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `S3_*`,
`AUTH_SECRET`, `MAPS_2GIS_API_KEY`) for cache-hashing purposes;
`TEST_DATABASE_URL` was never added to it when CR-095 introduced the
variable, so Turborepo strips it from the child process's environment even
when it's exported in the parent shell. A plain `pnpm turbo test` therefore
fails 15/25 `apps/api` test files with "TEST_DATABASE_URL is required" — not
a real regression, just an invocation that silently loses the variable it
needs.
Impact: low — `pnpm --filter api test` (what this repo's CI actually runs,
`.github/workflows/ci.yml`, with `TEST_DATABASE_URL` set as a real job-level
env var rather than routed through `pnpm turbo test`'s env-passthrough) is
unaffected; only a plain top-level `pnpm turbo test` invocation hits this.
Workaround: run `pnpm --filter api test` (or `pnpm --filter api exec vitest
run`) with `TEST_DATABASE_URL` exported directly, not through `pnpm turbo
test`.
Next action: add `TEST_DATABASE_URL` to `turbo.json`'s `test` task `env`
array — a one-line config fix, not attempted this session (found during
CR-097's own validation sweep, unrelated to that ticket's actual scope).
Resolution 2026-09-26 (CR-134): `TEST_DATABASE_URL` (and `RUN_LIVE_S3_TESTS`,
stripped the same way — CI's live S3 test was silently skipping) added to
`turbo.json`'s `test` env; `DATABASE_URL` untouched. The Impact line above was
wrong: CI runs `pnpm test` (Turbo), not `pnpm --filter api test`, so CI's api
suite was failing too. `pnpm test` with `TEST_DATABASE_URL` exported: 5/5
tasks, api 438 passed / 4 skipped.

### KI-014 — `apps/api`'s Redis client was never connected to a live Redis

Status: open — narrowed, real consumer now exists. Discovered: 2026-09-12
(CR-005).
Problem: Docker's daemon did not come up in this environment (same issue as
CR-004's Postgres validation), and unlike CR-004 there was no already-running
local Redis to fall back to — installing one via Homebrew for this session was
explicitly declined. `src/redis.ts` (`createRedisClient`) was therefore only
typechecked/linted/built, never actually connected to a running Redis.
Impact: low — the file is a thin, well-known-library wrapper (construct
`ioredis.Redis` with a URL and `maxRetriesPerRequest`), and it isn't consumed
by any running code path yet (ADR-004: no justified use until CR-050/CR-058).
Still, "never actually connected" is a real gap, not a formality.
Workaround: none needed yet — nothing calls this code.
Next action: verify a real connection (e.g. `docker compose up redis` +
`redis-cli ping`, or exercise it from whichever of CR-050/CR-058 consumes it
first) before or during whichever CR wires this client into a real code path.
Update 2026-09-16 (CR-050, "Async notification delivery via Redis queue"): this
is now `apps/api`'s first real Redis consumer (`modules/notifications/queue.ts`
— a `bullmq` producer/worker), same shape KI-015 hit with S3/CR-027. This
session live-verified the _unreachable_-Redis behavior only (connection errors
logged, boot never crashes, enqueue/shutdown calls are bounded and never hang
— see `docs/changelog.md`'s CR-050 entry) — genuinely connecting to a live,
reachable Redis and confirming a job round-trips through the worker into a real
`notifications` row is still unverified and still blocked on this same
Docker-unreachable constraint. Next action unchanged: the first session with a
working Docker daemon (or an installed local Redis) should additionally confirm
that live round trip, the way CR-004 did for Postgres.
Update 2026-09-19: Docker Desktop worked in this session (see
`docker-desktop-unavailable` memory — treat that as a point-in-time constraint,
not permanent). `docker compose up -d redis` + the running `apps/api` dev
server's own `/health` reported `redis: "ok"`; a standalone `ioredis`/`bullmq`
script (`new Redis(REDIS_URL)`, `new Queue('notifications', {connection})`)
also connected and reached `waitUntilReady()` against the real
`redis:8-alpine` container with `--requirepass`. This closes the
connection-level gap. Still open: an actual job enqueued through
`notifications.service.ts` round-tripping through the `Worker` into a real
`notifications` table row was not exercised this session — that's the
remaining next action, not the connection itself.

Update 2026-09-26 (CR-133): repeated local e2e runs tripping the 5/min auth
limit is handled by the test/dev-only `AUTH_RATE_LIMIT_MAX` override
(`apps/api/src/env.ts`, rejected in production); the Playwright-started API
sets it, an already-running dev API needs it in the root `.env`. The Redis
job round trip above is still the open part.

Resolution 2026-09-26 (CR-135): closed by the new `apps/web/e2e/
notifications.spec.ts`, run against an `apps/api` with `REDIS_URL` set
(`/health` → `redis: "ok"`): the organizer's ride update and the ride's
cancellation go through `queue.add('ride_update' | 'ride_cancelled')`, the
in-process `Worker` consumes them, and the resulting `notifications` rows show
up in the participant's inbox — the job round trip this entry still had open.
Passed with 1 worker and in parallel.
