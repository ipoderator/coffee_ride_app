# Project State

This file is a **snapshot** of current state, overwritten each time — not a history.
For the full narrative of how the project got here (decisions, bugs found, live
verification steps), see `docs/changelog.md`.

## Phase

MVP. Foundation, Design-foundations, and Auth phases complete. Rides: full organizer
lifecycle (`draft → published → registration_open → registration_closed → started →
finished`, plus `cancelled`) implemented end to end; public discovery with filters and
a map view; GPX route upload/rendering/distance-elevation reconciliation; named
organizer-curated stops; typed organizer-placed route points (map pins). Route section
of `docs/tasks.md` is fully complete. Registration section is fully complete:
register/cancel/capacity/duplicate-protection (CR-032..035), waitlist with
auto-promotion (CR-036), organizer participant/waitlist list (CR-037), and
participant-facing "My registrations" (CR-091). Communication section is now fully
complete too: registration-confirmation/waitlist-promotion notifications (CR-038),
organizer ride updates with fan-out (CR-039), ride-cancellation fan-out (CR-040), and
the participant-facing in-app inbox (CR-041). Post-ride is now fully complete too:
participant reviews of finished rides (CR-042) and the organizer-wide rating
aggregate they feed (CR-043). Quality (CR-044..048 — responsive/a11y/states/
security/performance audits) is now fully complete too. Resilience is now fully complete: CR-049 (timeout/retry/circuit-breaker
utilities), CR-050 (async notification delivery via Redis queue), CR-051
(health check endpoint), and CR-052 (frontend degraded-state handling — closed
2026-09-17 on reactive per-call handling that was already real, plus one missing
test; see `.claude/context/known-issues.md` KI-041 for the reactive-vs-proactive
`/health`-banner scoping decision) are all done.

## Current task

None active. CR-099 (fix findings from a user-run QA pass against a live
browser) closed this session, on top of CR-098 from the prior session. The
user ran manual QA against a real browser and reported seven findings; five
were real bugs, fixed:

1. Dark theme never activated (`.dark` tokens existed since CR-063, nothing
   ever applied the class) — fixed via a `beforeInteractive` script reading
   `prefers-color-scheme` in `app/layout.tsx`. No manual toggle.
2. No shared nav on `/`, `/register`, `/login` — fixed via a new `SiteHeader`
   in a new `(public)` route group wrapping exactly those three routes, plus
   direct cross-links in `RegisterForm`/`LoginForm`.
3. Register success screen's "verification link" was the raw, POST-only API
   path (`/v1/auth/verify-email?token=...`, missing `/api`, 404s in a
   browser) rendered as if clickable — fixed to link to the real web page.
4. `/verify-email`, `/forgot-password`, `/reset-password` all 404'd (API
   existed, no screens — KI-026/KI-042) — fixed: three new `features/auth/*`
   modules + pages, live-verified end to end (register → click link → "Email
   подтверждён"). Both KIs narrowed, not fully resolved: real production
   usability still needs ADR-007's pending email delivery.
5. No loading indicator on `/organizer/rides/[id]/{edit,route,cover}` during
   navigation (~2-3.5s of only the static `<h1>`) — fixed with a new shared
   `loading.tsx` for that route segment (covers `participants`/`updates`
   too).

Two findings investigated, found not to be bugs, no code change: the 2GIS
map's flat visual in a headless sandbox browser (same conclusion CR-098
already reached — real key/tiles/markers confirmed via network/DOM, a
sandbox WebGL rasterization limit, not an integration bug); the duplicate
`GET /v1/organizers/me` request (React 18 Strict Mode's intentional
dev-only double-invoke of `useEffect`, universal to this codebase's
fetch pattern, absent from production builds).

`pnpm --filter ui typecheck` clean; `pnpm --filter web typecheck`/`lint`/
`build` clean; `pnpm --filter web test` 208/208 passing (10 new). No
unchecked ticket remains in `docs/tasks.md`. Next logical step: pick a new
one — candidates are KI-036 (route-detail map), the one-line `turbo.json`
fix for KI-050 (`test` task's `env` allowlist missing `TEST_DATABASE_URL`),
or ADR-007 (real email delivery) to fully close KI-026/KI-042.

## Implemented

**Infra/tooling**: pnpm + Turborepo monorepo, Node 24 LTS. Git on `main`, remote
`origin` (github.com/ipoderator/coffee_ride_app, public). CI (GitHub Actions) runs
format/lint/typecheck/build/test plus DB migrations, and (CR-080, new) a real
`minio` service + a genuine, unmocked S3 round-trip test
(`route-storage.live.test.ts`, gated on `RUN_LIVE_S3_TESTS=1`) plus a Playwright
e2e job (`playwright.config.ts`'s `webServer` now starts both `apps/api` and
`apps/web` in order) — the first place KI-015 (S3 client never connected to a
live store) and KI-007 (no e2e in CI) can actually be closed, since GitHub
Actions runners have real Docker unlike this local sandbox. Husky/lint-staged is
workspace-aware (each package linted with its own config). `docker-compose.yml`
defines Postgres/Redis/MinIO but has never been live-booted in this environment —
Docker's daemon is unreachable here (KI-019; see `docker-desktop-unavailable` in
Claude's project memory). Its `redis` service now requires a password and persists
via AOF (CR-077, KI-003 resolved): `command: redis-server --requirepass
redis-dev-only --appendonly yes`, healthcheck authenticates too; `.env.example`'s
`REDIS_URL` matches (`redis://:redis-dev-only@localhost:6379`) — `ioredis`
(`apps/api/src/redis.ts`) parses the embedded credential natively, no application
code change needed. `docker-compose.prod.yml` still runs no Redis of its own
(ADR-018) — a production instance's password/persistence stays that instance's
own operator's responsibility. `apps/web/Dockerfile` and `apps/api/Dockerfile` (CR-074,
new) plus a root `.dockerignore` give both apps real multi-stage, non-root-user
container images — `apps/web` via Next's `output: 'standalone'` trace,
`apps/api` via ADR-017's esbuild bundle pruned to a production-only `node_modules`
through `pnpm --filter=api deploy --prod`. Neither image has had an actual
`docker build` run against it yet, same root cause as the compose file (KI-043).
`docker-compose.prod.yml` + `deploy/Caddyfile` (CR-075, ADR-018, new) put both
images behind one public origin: Caddy terminates TLS (automatic ACME) and
reverse-proxies to `web` only — `apps/web`'s own `next.config.ts` rewrite already
forwards `/api/v1/*` to `api` internally, so `api` publishes no host port at all.
Excludes Postgres/Redis/S3 by design (assumed externally provisioned). Migrations
(CR-076): `packages/db/src/migrate.ts` now wraps its call in a session-level
Postgres advisory lock (a real race — two concurrent runs against a fresh DB
reliably failed before the fix, confirmed live) so it's safe under concurrent
invocation; `packages/db/Dockerfile` + `docker-compose.prod.yml`'s `migrate`
service (gated behind the `migrate` Compose profile — absent from a plain
`docker compose up`) give it an explicit deploy-step home, never wired into any
service's boot. None of this has been run end to end via a real `docker build`/
`docker compose up` (KI-045, same root cause as KI-019/KI-043; Caddy's ACME also
needs real public DNS, unverifiable in any sandbox) — the migration fix itself
was still live-verified, just on the host directly rather than in a container.

**apps/web**: Next.js 15 + React 19 + TS 6.0.3, Tailwind v4 + shadcn/ui, real design
tokens/typography/Russian formatting from `docs/design.md` via `packages/ui`. Dark theme
now activates from `prefers-color-scheme` (CR-099, `app/layout.tsx`'s pre-hydration
script) — the `.dark` tokens had existed unused since CR-063. `/`, `/register`, `/login`
live in a `(public)` route group sharing a new `SiteHeader` (CR-099) — the only nav
between them and into a cabinet previously required typing a URL. Screens:
`/register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password` (last
three new, CR-099 — narrows KI-026/KI-042, real usability still blocked on ADR-007's
pending email delivery), `/me` + `/me/profile` + `/me/rides` + `/me/notifications`,
`/organizer` (dashboard) + `/organizer/profile` + `/organizer/rides`
(list/new/[id]/edit/[id]/route/[id]/participants/[id]/updates), `/` (public
discovery — list/map toggle, bicycleType filter, upcoming-only sort) and
`/rides/[id]` (public ride detail, incl. elevation profile, stops, and a
`RegistrationButton` — register/cancel/join-or-leave-waitlist states, redirects to
`/login` on 401). `/organizer/rides/[id]/participants` (CR-037):
`ParticipantTable`/`WaitlistTable`, linked from `EditRideForm`. `/me/rides`
(CR-091): `MyRidesView`, Upcoming/Past tabs, read-only (links out to `/rides/[id]`
for cancellation). `/organizer/rides/[id]/updates` (CR-039): `UpdateComposer` —
compose form + read-only history, linked from `EditRideForm`. `/me/notifications`
(CR-041): `NotificationList`, one page newest-first, click an unread card to mark
it read and open its ride, no unread-count badge. `/rides/[id]` (CR-042) gained a
"Отзывы" section — `ReviewForm` (own feature-local 1-5 rating picker) shown only for
a viewer with an active registration on a `finished` ride who hasn't reviewed yet,
plus a public `ReviewList`; the ride's organizer rating (CR-043) shows next to the
organizer name whenever they have at least one review. `/organizer/profile`
(`OrganizerProfileForm`) shows the same aggregate rating card once a profile exists.
Cabinet shell + nav/widget registries (ADR-009, verified/tested by CR-054)
exist for both organizer and participant sides — participant nav has three
entries (profile, my registrations, notifications), organizer nav has two
(profile, rides); organizer also has a widget registry backing `/organizer`'s
dashboard (`docs/design.md` §8), participant has none since no participant
widget grid is spec'd. Both descriptor types have an optional `flag` field
(CR-055, `lib/cabinet/feature-flags.ts`) staged-rollout-gated via a
server-only `FEATURE_<NAME>` env var, filtered in at each cabinet's
`layout.tsx`/`organizer/page.tsx` — no current entry sets one. No per-item
capability field exists (nothing currently needs one — both cabinets are
already separate route trees). CR-044/045/046/048 (Quality) landed on top
of all of the
above: `CabinetShell` now renders a real `<main>` landmark with a responsive
nav (bottom tab bar at `base`, sticky side column at `md`+); `RideDetailView`
is two-column at `md`+; `DiscoveryList`/`DiscoveryViewToggle` show a combined
list+map split view at `lg`+ (both panels always mounted, the inactive one
CSS-gated `hidden lg:block`); a shared `xl` max-width-1200px-centered container
wraps every page from the root `layout.tsx`; every `ErrorState` call site now
offers `onRetry`; `RideCard`/`RideDetailView`'s cover image uses `next/image`
— live since CR-086, no longer inert. `/organizer/rides/[id]/cover`
(CR-086, new): upload/replace/delete a ride's cover image, linked from
`EditRideForm`.

**apps/api**: Fastify 5 + Zod + RFC 9457 errors + OpenAPI (ADR-011, `/v1` prefix,
cursor pagination). Every request gets a correlatable id (CR-079,
`lib/request-id.ts` as Fastify's `genReqId`): a valid inbound `X-Request-Id`
is reused (for the CR-075 Caddy → web → api hop), otherwise one is
generated; always echoed back as the response header. Pino logs carry
`base: { service: 'api' }`. `app.reportError(error, message, context?,
logger?)` (`plugins/error-reporting.ts`, CR-079/KI-006) is the single funnel
an unexpected 500 (`error-handler.ts`) and a notification-job
failed-after-retries (`modules/notifications/queue.ts`) both go through:
always logs structurally, and optionally forwards to a webhook sink via
`ERROR_REPORTING_WEBHOOK_URL` (generic seam behind a shared `CircuitBreaker`
— no error-tracking vendor is decided yet). `GET /health` (unversioned) reports real, bounded DB/Redis/S3
status (`ok`/`error`/`not_configured` per dependency, overall `ok`/`degraded`),
always `200` (CR-051). `@fastify/helmet` registered globally in `app.ts`
(`plugins/security-headers.ts`, CR-061) — every response (`/health`, `/docs`,
`/v1/*`) carries CSP/`X-Content-Type-Options`/`X-Frame-Options`/`Referrer-Policy`;
CSP drops `upgrade-insecure-requests` (this app doesn't terminate TLS itself) and
tightens `frame-ancestors`/`X-Frame-Options` to `'none'`/`DENY`. Production `build`
now bundles via `esbuild` (`scripts/build.mjs`, ADR-017) instead of plain `tsc` —
`db`/`types`/`resilience`'s source is inlined into one `dist/server.js`, every real
npm dependency stays external; `dev`/`typecheck`/`test` scripts are unaffected
(still `tsx`/`vitest`/`tsc --noEmit`). Capability modules: `auth` (register/verify-email/login/logout/me,
Argon2id, DB-backed sessions per ADR-013, CSRF via Origin/Referer check on every unsafe
`/v1` method; CR-060 added `POST /v1/auth/forgot-password`/`reset-password` —
always `204` regardless of whether the email exists, no dev-token exposure at
all unlike register's `verificationUrl`; a successful reset revokes every
session for that user and invalidates every other outstanding reset token),
`users` (profile PATCH), `organizers` (OrganizerProfile CRUD, create
gated on `emailVerified`), `rides` (create/edit draft, every lifecycle transition,
owner's "mine" list, public list + detail with filters/bbox/pagination, GPX route
upload/download/geometry, distance/elevation reconciliation, stop CRUD and route-point
CRUD — both draft-only, embedded as additive `stops`/`routePoints` arrays on ride
detail; CR-086/ADR-019: cover image upload/replace/delete/download —
JPEG/PNG/WebP verified by decoding with `sharp`, 8 MB cap, resized to
1920×1920 max, served via an API proxy never a direct S3 URL, same
ownership/draft-only + viewer-visibility rules as route — `coverImageUrl` on
ride detail is now real, computed from the stored S3 key), `registrations`
(its own capability module, `POST`/`DELETE
/v1/rides/:id/register` — capacity + duplicate protection via one `SELECT ... FOR
UPDATE` row lock; idempotent (CR-083) — a repeat register/waitlist-join call while
the caller already has that exact row returns `200` with the existing row instead of
erroring or creating a duplicate, no second `registration_confirmed` notification
either; `POST`/`DELETE /v1/rides/:id/waitlist` (CR-036) — joining requires
the ride to actually be full, re-derived server-side; cancelling a registration
auto-promotes the oldest waiting entry (FIFO) into a fresh active registration inside
the same transaction/row lock; embedded as additive `registrationsCount`/
`viewerRegistration`/`viewerWaitlistEntry` on ride detail; `GET /v1/rides/:id/
participants`/`.../waitlist` (CR-037) — organizer-only, cursor-paginated, own minimal
`RideParticipantSummary` shape with no phone/email; `GET /v1/registrations/mine`
(CR-091) — the caller's own active registrations, two independently cursor-paginated
`?when=upcoming|past` tabs, joined with each ride's public+organizer summary, own
`/v1/registrations` URL prefix), `notifications` (its own capability module, CR-038..041:
`POST`/`GET /v1/rides/:id/updates` — organizer-only, sharing the `/rides` prefix,
fans out a `ride_update` notification to every active registrant; `GET
/v1/notifications/mine` + `POST /v1/notifications/:id/read` under their own
`/notifications` prefix; a `registration_confirmed` notification also fires from
`registrations`'s `createRegistration`/waitlist-promotion, and a `ride_cancelled`
fan-out fires from `rides`'s `cancelRide` — every producer enqueues onto a `bullmq`
queue (`modules/notifications/queue.ts`, CR-050) when `REDIS_URL` is configured, an
in-process `Worker` in the same process does the actual insert; falls back to the
pre-CR-050 direct synchronous insert when it isn't (this environment — KI-014,
Docker unreachable, live Redis still unverified end to end). Log-and-swallow either
way on failure. Auth endpoints (`register`/`login`/`forgot-password`) are
rate-limited on two independent tiers (CR-058, resolving KI-022): the
general per-IP tier (`app.ts`), backed by `@fastify/rate-limit`'s own
`RedisStore` when `REDIS_URL` is configured (shared across instances) or its
in-memory store otherwise, plus a new per-account tier
(`lib/account-rate-limit.ts`, keyed by normalized email) independent of it.
Both fail open on a Redis error/timeout — a degraded Redis costs only the
shared-counter protection, never blocks login/register. `reviews`
(CR-042, its own
capability module): `POST`/`GET /v1/rides/:id/reviews` — create is eligibility-gated
(active registration on a `finished` ride, one review per user per ride), list is
public/paginated; `GET /v1/rides/:id/reviews` and the DB unique index are the only
guards, no edit/delete. CR-043 ("Organizer rating summary") added no endpoint:
`avg(rating)`/`count(*)` across an organizer's rides is additive `rating`/
`reviewCount` on `RideOrganizerSummary` (`GET /v1/rides`, `GET /v1/rides/:id`,
batched not N+1 on the paginated endpoints) and on `GET`/`POST`/`PATCH
/v1/organizers/me`.

**packages/db**: Drizzle + Postgres. Tables: `users`, `email_verification_tokens`,
`password_reset_tokens`, `sessions`, `organizer_profiles`, `rides`, `routes`, `stops`,
`route_points`, `registrations`, `waitlist_entries`, `ride_updates`, `notifications`,
`reviews`. `scripts/backup.sh`/`scripts/restore.sh` (CR-078, new): plain
`pg_dump --format=custom`/`pg_restore --clean --if-exists` wrappers driven
entirely by `DATABASE_URL`, same hosting-agnostic shape as `migrate.ts` —
`pnpm --filter db db:backup`/`db:restore`, documented in `docs/database.md`.
Restore live-verified this session against this environment's real local
Postgres (marker row round-tripped through a real backup into a scratch
database, all 14 tables' counts matched, then cleaned up) — see
`docs/changelog.md`'s CR-078 entry. `docker-compose.prod.yml`'s new `backup`
service (CR-095) actually runs `backup.sh` on a schedule now — see below.

**Test isolation** (CR-095, new): `apps/api/src/test-support/
test-database-url.ts` (`getTestDatabaseUrl`) is the only way any `apps/api`
test file obtains a database connection string — reads `TEST_DATABASE_URL`
only (never `DATABASE_URL`, which `.env` sets for real dev/prod use) and
refuses to run unless the resolved database name looks disposable
(contains "test", or is exactly "coffee_ride"). Resolves KI-049 (a real
local dev database was wiped by the test suite's unscoped `DELETE FROM`
cleanup running against `.env`'s real `DATABASE_URL`).

**packages/types**: shared Zod contracts + domain types for everything above;
`ProblemDetails`/`Paginated<T>` (ADR-011).

**packages/ui**: design tokens (light/dark, `docs/design.md` §3-5), Russian formatters

- terminology (§6-7, §13), component set — `MetricTile`/`MetricRow`, `StatusBadge`,
  `DifficultyScale`, `Skeleton`, `EmptyState`, `ErrorState`, `Button`/`Input`/
  `FormField`/`Card`/`Textarea`.

**packages/maps-core / packages/maps-2gis**: provider-neutral `MapProvider` interface
(ADR-010) + a 2GIS REST adapter (geocode/reverseGeocode/getRoute, no SDK dependency). A
live server-side `MAPS_2GIS_API_KEY` (Geocoder/Directions product) now exists in local
`.env` (CR-093, 2026-09-19) and was exercised directly against `create2GisMapProvider`:
`geocode`/`reverseGeocode` field-name guesses were correct; `getRoute`'s geometry guess
was wrong (real polyline lives in `maneuvers[].outcoming_path.geometry[]` as WKT
`LINESTRING` strings, not a flat `{lat, lon}` array) and has been fixed and
re-verified — KI-016 resolved. `MapProvider` (geocode/reverseGeocode/getRoute) itself still has zero real consumers
(KI-032's geocode-by-address UI remains open). `fetchJson` retries once and shares one
`CircuitBreaker` across all three methods (CR-049, below), replacing its previous
timeout-only logic.

CR-098 (2026-09-20, ADR-020): a real public `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` now
exists (same 2GIS project key as `MAPS_2GIS_API_KEY`). Added `packages/maps-core/src/
render.ts` (`MapRenderer`/`MapHandle`/`MapMarkerInput`/`MapRenderOptions`,
provider-neutral, kept separate from `MapProvider` since server code never renders a
map) and `packages/maps-2gis/src/render.ts` implementing it against the real
`@2gis/mapgl` SDK (this package's first genuine npm vendor dependency, dynamically
imported, browser-only). `apps/web/src/lib/maps/create-map-renderer.ts` is the one
composition point allowed to import `maps-2gis` directly (scoped `eslint.config.mjs`
override). `DiscoveryMap` (new) replaces `RideMapPlaceholder` on `/`, plotting each
published ride's `startLat`/`startLng`; falls back to the same placeholder on a missing
key or failed render. Live-verified in a real headless browser: real key/style/tile
requests all `200`, three markers at three distinct positions matching three seeded
rides, zero console errors — KI-031's discovery half is resolved. The route-detail map
(`RouteMapPlaceholder`, `Route.geometry` polyline, `RoutePoint`/`Stop` markers) is
untouched, deliberately deferred to KI-036.

**packages/resilience** (new, CR-049): shared `callWithResilience` (timeout via
`AbortSignal` + bounded retry with jittered backoff) and `CircuitBreaker`
(closed/open/half-open). Wired into `packages/maps-2gis` and `apps/api`'s S3
`route-storage.ts`, replacing each integration's previous independent, partial
implementation — both still normalize failures into their own existing domain error
(`MapProviderError`/`RouteStorageError`), no caller-visible contract change. See ADR-016.
First real consumer of `redis.ts`'s `createRedisClient` is now `apps/api`'s
`modules/notifications/queue.ts` (CR-050) — its enqueue and graceful-shutdown calls
are bounded by a hand-rolled `Promise.race` timeout rather than `callWithResilience`,
since `bullmq`'s `Queue.add()`/`close()` accept no `AbortSignal` to race against
(confirmed live: without it, both hang indefinitely against an unreachable Redis).
That timeout helper now lives in `apps/api/src/lib/race-timeout.ts` (extracted from
`queue.ts`, CR-051) since `routes/health.ts`'s DB/Redis checks hit the identical
no-`AbortSignal` gap; its S3 check goes through `callWithResilience` directly instead,
since the AWS SDK does honor `abortSignal`.

Current test counts and per-feature detail: see the latest entries in
`docs/changelog.md` rather than this file — a fixed number here goes stale the moment
the next ticket adds tests.

## In progress

None.

## Next

`docs/tasks.md` Registration (CR-032..037, CR-091), Communication (CR-038..041),
Post-ride (CR-042/CR-043), Quality (CR-044..048), Resilience (CR-049..052), and
Extensibility foundations (CR-053..056) sections are all now fully complete.
Security foundations section is now fully complete: CR-058 (Redis-backed,
per-IP-and-per-account auth rate limiting) closed 2026-09-19, once Docker/a
live Redis happened to be reachable in this environment. KI-044 (whether
`apps/api` sees each real client's IP through the Caddy→web→api hop, not
just `web`'s internal one) stays open — it matters for the per-IP tier
specifically, unaffected by this ticket. Deployment: CR-074/075/076/077/078/079/080
(Dockerfiles; Caddy reverse proxy/TLS/resource limits/restart policy,
ADR-018; migrations as an explicit, concurrency-safe deploy step; Redis
password + AOF persistence; Postgres backups + a live-verified restore;
request-id correlation + error-reporting funnel; CI MinIO service + real S3
round-trip test + Playwright e2e job, KI-007) and now CR-081 (full prod env
var set + `docs/deployment.md`, new — also resolved KI-046 for real), and
CR-082 (fixed `.github/dependabot.yml`'s docker/docker-compose coverage —
nothing that sets a base image version had ever actually been scanned by
Dependabot before this) are all closed — the entire Deployment section is
now done. CR-083 (registration/waitlist-join idempotency — a network retry
of an already-successful call now returns the existing row instead of
`409`, no client change needed) and CR-092 (real critical-journey e2e
specs — `apps/web/e2e/critical-journeys.spec.ts`, the three journeys
`.claude/rules/testing.md` names, API-seeded fixtures + real UI-driven
assertions) are also closed, and CR-058 (Redis-backed auth rate limiting)
closed 2026-09-19 (above). CR-094 (SIGTERM/SIGINT graceful shutdown,
KI-048), CR-095 (test-suite data-loss guard + backup schedule, KI-049), and
CR-086 (cover image pipeline, ADR-019) are also closed — `docs/tasks.md` has
no unchecked ticket left.

## Important decisions

See `docs/decisions.md`. Notably:

- ADR-008: modular monolith, not microservices — failure isolation via
  `.claude/rules/resilience.md`, not via service boundaries.
- ADR-009: feature-module architecture for organizer/participant cabinets — see
  `.claude/rules/extensibility.md`.
- ADR-006 + ADR-013: email+password, capability-based authorization, database-backed
  sessions, single-origin deployment with `SameSite=Lax` + `Origin` check for CSRF and
  no CORS. Full checklist in `.claude/rules/security.md`.
- ADR-010: maps provider (2GIS) accessed only through `packages/maps-core` /
  `packages/maps-2gis` adapter split.
- ADR-011: `/v1` prefix, cursor pagination on every collection, RFC 9457 error
  envelope.
- ADR-012: `timestamptz` everywhere; `Ride` also stores its start location's IANA
  zone.
- ADR-014: map discovery's geo query is plain `startLat`/`startLng` columns + a bbox
  range query (composite B-tree index), not PostGIS — no named radius-search use case,
  no PostGIS in the current Postgres image.
- ADR-015: GPX upload is bounded by a 10 MB size cap (`@fastify/multipart`) plus a
  streaming SAX parse (`sax`), not a worker thread — revisit only if a real perf
  problem is measured at scale.
- ADR-016: timeout/retry/circuit-breaker mechanics for external integrations live in
  one shared package, `packages/resilience`, wired at each integration's own call
  site (`packages/maps-2gis`, `apps/api`'s S3 route-storage module) — not
  reimplemented per integration.
- ADR-017: `apps/api`'s production `build` bundles `db`/`types`/`resilience`'s source
  into `dist/server.js` via `esbuild` (`apps/api/scripts/build.mjs`), resolving
  KI-017's real `ERR_MODULE_NOT_FOUND` boot crash — every real npm dependency stays
  external. `db`/`types`/`maps-core`/`maps-2gis`/`resilience` themselves are
  unchanged.
- ADR-018: production reverse proxy is Caddy (automatic TLS/ACME), proxying only
  to `apps/web` — never directly to `apps/api`, since `apps/web`'s own rewrite
  already forwards `/api/v1/*` internally. Does not decide where Postgres/Redis/S3
  run in production (still open, `docs/architecture.md`).
- CR-076 (no new ADR — an implementation fix + deploy-manifest addition, not an
  architectural decision): `packages/db/src/migrate.ts` wraps its migration call
  in a session-level Postgres advisory lock, since drizzle's own migrator was
  confirmed unsafe under concurrent invocation (a real, reproduced race, not
  theoretical). `docker-compose.prod.yml`'s `migrate` service (Compose-profile
  gated) is the explicit deploy step this runs as — never on `apps/api`'s boot.
- CR-079 (no new ADR — an implementation addition, not an architectural
  decision): `app.reportError` is the single funnel for unexpected 500s and
  background job failures; an external error-tracking vendor stays an open,
  undecided choice (consistent with ADR-016's "add observability hooks only
  when actually needed") — the webhook sink is a generic, unverified-against-
  any-real-endpoint extension point, not a vendor integration.
- CR-078 (no new ADR — an implementation addition, not an architectural
  decision): `packages/db/scripts/backup.sh`/`restore.sh` are plain,
  `DATABASE_URL`-driven `pg_dump`/`pg_restore` wrappers; backup destination
  (local disk vs. offsite/S3 sync) stays exactly as undecided as Postgres
  hosting itself (ADR-018) — deliberately not resolved here.
- Design direction (not an ADR — see `docs/design.md`): calm, low-saturation palette,
  warm neutral base with one muted teal-green accent. One exception: `danger` is a
  bright red, reserved for cancellation/failure (`StatusBadge`, `Button
variant="danger"`).

## Known limitations

Full list with IDs and next actions: `.claude/context/known-issues.md`. Headline
items:

- Deployment artifacts now exist (`apps/web/Dockerfile`, `apps/api/Dockerfile`,
  root `.dockerignore` from CR-074; `docker-compose.prod.yml` + `deploy/Caddyfile`
  from CR-075; `packages/db/Dockerfile` + the `migrate` service from CR-076) but
  none has been exercised by a real `docker build`/`docker compose up`/`docker
compose run` (KI-043, KI-045) — Docker's daemon is unreachable throughout this
  environment, same root cause as the never-booted dev `docker-compose.yml` and
  the still-unverified Redis/S3/Postgres-via-compose gaps (KI-001,
  KI-014, KI-015, KI-019). Caddy's automatic TLS additionally needs real
  public DNS, unverifiable in any sandbox regardless of Docker access. KI-002
  itself (migration execution during deploy) is resolved — the migration
  script's own concurrency-safety was proven live on the host; only the
  container-build step around it is unverified.
- CI (CR-080, KI-007 resolved) now runs a real e2e job and a real,
  unmocked S3 round-trip test against a `minio` service — the first place
  either can actually be exercised, since GitHub Actions runners have real
  Docker unlike this local sandbox (KI-019). Neither has been proven by an
  actual GitHub Actions run yet (none available from this sandbox) — same
  category of "verified locally, not against the exact real CI runner" gap
  as KI-043/KI-045's Docker artifacts. The three critical-journey e2e specs
  `.claude/rules/testing.md` names (discover+register, organizer
  create+publish, view participants) now exist (CR-092,
  `apps/web/e2e/critical-journeys.spec.ts`) and pass locally via `pnpm
test:e2e` — same "not yet proven against the exact real CI runner" caveat
  as the rest of this bullet.
- `docs/deployment.md` (new, CR-081) documents the full production deploy procedure
  (prerequisites, `.env` setup, first-boot migrate-then-serve order, verification,
  redeploy/rollback) but — same as every other Deployment-section artifact — has not
  been exercised by an actual `docker compose up` (KI-043/KI-045). `apps/api/src/
env.ts`'s `REDIS_URL`/`S3_ENDPOINT` now normalize an empty string to "not configured"
  the same way `ERROR_REPORTING_WEBHOOK_URL` already did (KI-046, resolved), with new
  test coverage in `apps/api/src/env.test.ts`.
- Rate limiting is now Redis-backed (shared across instances) plus a new
  independent per-account tier when `REDIS_URL` is configured, both failing
  open on a Redis error (CR-058, resolving KI-022 — see `docs/changelog.md`).
  Still open: KI-044 (whether `apps/api` sees each real client's IP or just
  `web`'s single internal one through the Caddy→web→api hop is unverified —
  matters for the per-IP tier specifically, not the new per-account one,
  which is keyed by email, not IP). `apps/api`'s production boot crash on
  `db`/`types`'s raw-TS-source exports (KI-017) and missing `@fastify/helmet`
  security headers are both resolved (ADR-017, CR-061).
- KI-049 (found and resolved same session, CR-095): a previous session's
  `apps/api` test run wiped the real local dev Postgres (`.env`'s
  `DATABASE_URL`) because the suite ran its unscoped cleanup against
  whatever database it was pointed at. Fixed structurally, not just
  documented: tests now read `TEST_DATABASE_URL` (`.env` never sets it) plus
  a name-based refusal; `docker-compose.prod.yml` gained an always-on
  `backup` service so a scheduled backup actually exists once production is
  deployed, replacing the previous unactioned "add a cron entry" doc note.
- KI-048 (found CR-058, resolved CR-094): `server.ts` now registers a real
  `SIGTERM`/`SIGINT` handler (`lib/graceful-shutdown.ts`,
  `registerGracefulShutdown`) — first signal calls `app.close()` (draining
  `queue.ts`'s BullMQ worker/producer and `db.ts`'s Postgres pool) under a
  10s hard-fallback timer, a second signal mid-shutdown forces an immediate
  exit. Dependency-injected for unit testing; real signal delivery against a
  live container still unverified in this sandbox (KI-019).
- Geocoding is now verified against a live 2GIS account and its one real bug (route
  geometry parsing) fixed (KI-016, resolved CR-093), but `MapProvider` still has zero
  real consumers — no geocode-by-address UI (KI-032). MapGL rendering is now real and
  live-verified on the discovery map (CR-098, ADR-020, KI-031's discovery half
  resolved); the route-detail map (KI-036) stays an open follow-up, still showing its
  degraded placeholder. A ride's finish point has no coordinates (KI-033); route points
  have no participant-facing UI yet, API + organizer management only, pending real map
  rendering (KI-036).
- `/verify-email`, `/forgot-password`, `/reset-password` screens now exist (CR-099,
  narrows KI-026/KI-042) and are live-verified end to end in dev/QA. Real end-to-end
  use by a production user still needs ADR-007's still-Pending email delivery — the
  reset token still isn't exposed over HTTP in any environment, by design
  (no-account-enumeration requirement) — a screen alone doesn't close that half.
- Notification delivery (CR-038..041) now enqueues onto a real `bullmq`/Redis queue
  when `REDIS_URL` is configured (CR-050, KI-040 resolved); falls back to the
  pre-CR-050 direct synchronous insert when it isn't. Live connection-level
  Redis reachability was already confirmed as of 2026-09-19 (KI-014); this
  session reconfirmed it via `GET /health` (`redis: "ok"`) — the specific
  gap KI-014 still leaves open (an enqueued job actually round-tripping
  through the `Worker` into a real `notifications` row) was not exercised
  again this session.
- `GET /health` (CR-051): this session, with Docker up (KI-019 resolved),
  returned `{"db":"ok","redis":"ok","s3":"ok"}` against the real stack —
  confirms KI-014/KI-015's connection-level reachability holds again, not a
  new fact by itself; the endpoint's own degraded-vs-error distinction
  (always `200`, `error` only for a genuine failure, `not_configured` for an
  absent optional dependency) remains as documented either way.
- Discovery filters cover only `bicycleType`; distance/difficulty/price/date-range
  are deferred, no design-doc backing yet (KI-030).
- Observability (CR-079/KI-006): request-id correlation and structured
  error-reporting logging are real and live-verified. No error-tracking
  vendor is chosen yet — `ERROR_REPORTING_WEBHOOK_URL`'s webhook sink is a
  generic, unconfigured-by-default seam, never exercised against a real
  endpoint (no vendor/credential to verify against). Metrics/tracing remain
  out of scope (ADR-016).
- Provisional/deferred: `RideService`/registration-state terminology keys pending a
  real DB enum (KI-021); shadcn CLI's vendoring target still points at `apps/web`, not
  `packages/ui`, for any future structurally-complex primitive (KI-020). `Ride` cover
  images (CR-086, ADR-019) and `User`/`OrganizerProfile` avatars (CR-097) now both
  work end to end — KI-023 is fully resolved, no entity still lacks a photo path.

## Do not break

- documented stack;
- domain terminology;
- API/database boundaries;
- the API contract shape: `/v1`, cursor pagination, RFC 9457 errors (ADR-011);
- `timestamptz` + ride-local timezone (ADR-012);
- session revocation semantics and the single-origin/no-CORS posture (ADR-013);
- server-side registration invariants;
- `POST /v1/rides/:id/register`/`POST /v1/rides/:id/waitlist` replying `200`
  with the existing row (not an error, not a duplicate) on a repeat call
  for the same already-active registration/already-waiting entry (CR-083)
  — don't reintroduce the `409` on this specific retry path; the _other_
  "already" conflicts (`ride_full`, `ride_not_full`, an active registration
  blocking a waitlist join) are unaffected and must stay errors;
- `POST /v1/auth/forgot-password` returning an identical `204` regardless of
  whether the email exists, in every environment — no dev-only token field on
  this endpoint, unlike `register`'s `verificationUrl` (CR-060,
  `.claude/rules/security.md`);
- a password reset revoking every session for that user and invalidating
  every other outstanding reset token for that user (CR-060);
- `@fastify/helmet`'s CSP staying `upgrade-insecure-requests`-free (this app
  doesn't terminate TLS itself — that directive would break `/docs` over
  local `http://`) and `frame-ancestors`/`X-Frame-Options` staying
  `'none'`/`DENY` (CR-061);
- `apps/api/scripts/build.mjs`'s `external` computation staying derived from
  the union of `dependencies` across `apps/api` + every bundled workspace
  package (`db`/`types`/`resilience`), not just `apps/api`'s own
  `package.json` — and never bundling a real npm dependency (especially
  `argon2`, a native addon) into `dist/server.js` (ADR-017);
- `apps/api/package.json`'s `"files": ["dist"]` and the `inject-workspace-
packages=true` env var scoped to the one `pnpm --filter=api deploy` `RUN`
  step in `apps/api/Dockerfile` (not a repo-wide `.npmrc`, which would change
  how ordinary `pnpm install` resolves workspace:* dependencies everywhere —
  CR-074); `apps/web/Dockerfile`'s `runner` stage copying `.next/standalone`,
  `.next/static`, and `public` together (Next's own standalone-output tracing
  caveat — `apps/web`/`next.config.ts`'s `output: 'standalone'`, CR-074);
- server-side authorization checks (never UI-only — `.claude/rules/security.md`);
- the `packages/maps-core` boundary (no direct 2GIS SDK imports outside
  `packages/maps-2gis` — `.claude/rules/maps.md`, lint-enforced since CR-056:
  don't add `*2gis*`-matching packages to `no-restricted-imports`'s
  exemption list anywhere but `maps-2gis`'s own config);
- the loopback binding of infrastructure ports in `docker-compose.yml`;
- one shared timeout/retry/circuit-breaker implementation (`packages/resilience`,
  ADR-016) for every external integration — don't hand-roll a new ad hoc wrapper;
- notification producers falling back to a direct synchronous insert when
  `app.notificationQueue` is `null` (`REDIS_URL` unconfigured) — this is what keeps
  every existing test passing with no live Redis (CR-050);
- the shared `raceTimeout` helper (`apps/api/src/lib/race-timeout.ts`) around
  `bullmq` calls and the DB/Redis health checks — `callWithResilience` does not
  bound them (no `AbortSignal` support), so don't "simplify" this back to a bare
  `callWithResilience` call;
- `GET /health` always returning `200` with per-dependency `not_configured` vs.
  `error` distinguished — an absent optional dependency (Redis/S3 unconfigured) must
  never read as a failure (`.claude/rules/resilience.md`);
- feature-module isolation between organizer/participant cabinet features
  (`.claude/rules/extensibility.md`);
- Caddy proxying to `web` only, never directly to `api` (`docker-compose.
prod.yml`, ADR-018) — `apps/web/next.config.ts`'s rewrite is the one place
  `/api/v1/*` routing happens; don't add a second `/api` route at the proxy
  layer;
- `api`'s `WEB_ORIGIN` staying derived as `https://${DOMAIN}` inside
  `docker-compose.prod.yml` rather than a second, independently-set variable
  (ADR-018) — letting it drift from `DOMAIN` would silently break the CSRF
  Origin/Referer check;
- `docker-compose.prod.yml` staying free of Postgres/Redis/S3 service
  definitions (ADR-018 "What this does NOT mean") — that's a still-open
  production-hosting decision, not this file's to make;
- the `migrate` service staying behind the `migrate` Compose profile — never
  started by a plain `docker compose up`, and never wired into `apps/web`'s or
  `apps/api`'s own service definition or boot sequence (CR-076);
- `packages/db/src/migrate.ts`'s session-level advisory lock (`pg_advisory_
lock`/`unlock` around the whole `migrate()` call, same `{ max: 1 }` client
  for both) — this is what makes concurrent invocation safe (KI-002); don't
  "simplify" it back to a bare `migrate()` call, and don't swap the client for
  a `client.reserve()` connection either — drizzle's postgres-js driver reads
  `client.options`, which a reserved connection doesn't expose;
- every unexpected 500 (`error-handler.ts`) and every notification job
  failed-after-retries (`queue.ts`'s `worker.on('failed', ...)`) routing
  through `app.reportError`, not a direct `*.log.error(...)` call (CR-079) —
  that's what keeps "must be visible" meaning the same thing in both places;
  connection-level `.on('error', ...)` noise (Redis, BullMQ queue/worker)
  deliberately stays outside this funnel;
- `lib/request-id.ts`'s bounded charset/length check on an inbound
  `X-Request-Id` header before it's trusted into every log line (CR-079) —
  don't relax it to accept an arbitrary client-supplied value verbatim;
- `route-storage.live.test.ts`'s `RUN_LIVE_S3_TESTS === '1'` gate staying an
  explicit opt-in, not just "are `S3_*` set" (CR-080) — a local `.env` has
  them configured for MinIO whether or not MinIO is actually running, and
  this session hit that exact false positive before adding the flag; only
  `ci.yml` should ever set it;
- `playwright.config.ts`'s `webServer` staying a two-entry array (`apps/api`
  then `apps/web`, CR-080) — `/` has called the real API since CR-024, so a
  lone `apps/web` dev server is no longer sufficient for any e2e spec here.
- `apps/api` test files reading `TEST_DATABASE_URL` via
  `test-support/test-database-url.ts`'s `getTestDatabaseUrl()`, never
  `process.env.DATABASE_URL` directly (CR-095, KI-049) — don't reintroduce a
  direct `DATABASE_URL` read in a new test file; the disposable-name guard
  only protects files that go through this helper;
- the `docker-compose.prod.yml` `backup` service staying un-gated (no
  `migrate`-style profile) — it's read-only against the database and meant
  to run by default; and its shell command's `$$BACKUP_INTERVAL_SECONDS`
  staying double-escaped (Compose interpolates a bare `$VAR` itself at
  config-render time otherwise, turning it into an empty string);
- both rate-limit tiers (`app.ts`'s global `@fastify/rate-limit`
  registration and `lib/account-rate-limit.ts`'s per-account check, CR-058)
  failing OPEN on a Redis error/timeout, never closed — login/register are
  critical journeys (`.claude/rules/resilience.md`); don't add a
  `skipOnError: false`/fail-closed path "for security" without re-reading
  that rule first;
- the per-account rate-limit tier staying independent of the per-IP one
  (two separate gates keyed differently, not a combined key) and scoped to
  exactly `/register`/`/login`/`/forgot-password` (the three endpoints
  `.claude/rules/security.md` names) — don't extend it to
  `/verify-email`/`/reset-password`, which operate on opaque tokens, not an
  identifiable account from the request body;
- cover images/avatars served only through their API-proxy path (`GET
/v1/rides/:id/cover`, `/v1/users/me/avatar`, `/v1/organizers/:id/avatar`),
  never a direct S3 URL — the bucket stays private, and this is what lets
  `next.config.ts` skip an `images.remotePatterns` entry (CR-086/CR-097,
  ADR-019); file type is verified by actually decoding with `sharp`, never
  trusted from the client `Content-Type` header (SVG stays excluded — XSS
  risk); don't reintroduce a direct-URL/trust-the-extension shortcut;
- `lib/image-processing.ts`/`lib/image-storage.ts` (relocated from
  `modules/rides/cover-image*.ts`, CR-097) are shared by `rides`, `users`,
  and `organizers` — don't move them back into one capability module, and
  don't let `users`/`organizers` import a `rides`-owned file directly if a
  fourth caller ever needs this pipeline again;
- `users`/`organizers` avatar mutations stay "me"-scoped only (no `:id`
  variant for either) — only the organizer avatar _download_ is public and
  keyed by `:id` (`GET /v1/organizers/:id/avatar`), because an organizer's
  identity is already public via `RideOrganizerSummary`; don't extend that
  same public-by-id pattern to `users` without a real product reason (there
  is still no `GET /v1/users/:id` of any kind);
- the render-layer/server-provider split in `packages/maps-core`
  (`render.ts`'s `MapRenderer` vs. `provider.ts`'s `MapProvider`) — don't
  merge them onto one interface; server code must never see a render method
  (CR-098, ADR-020);
- exactly one file, `apps/web/src/lib/maps/create-map-renderer.ts`, imports
  `maps-2gis` — don't add a second import site, and don't widen its
  `eslint.config.mjs` override beyond that one `files` path;
- `DiscoveryMap`'s fallback to `RideMapPlaceholder` on a missing key or a
  failed `render()`/`load()` call — never let a map surface show a blank
  panel (`docs/design.md` §10).

## Last updated

2026-09-20 (CR-098)
