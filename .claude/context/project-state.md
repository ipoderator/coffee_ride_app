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

None active. CR-077 (Redis hardening, KI-003) just closed — CR-078 (Postgres
backups) is the one Deployment-section ticket that was already open before it
and remains open; CR-080/081/082 round out the section.

## Implemented

**Infra/tooling**: pnpm + Turborepo monorepo, Node 24 LTS. Git on `main`, remote
`origin` (github.com/ipoderator/coffee_ride_app, public). CI (GitHub Actions) runs
format/lint/typecheck/build/test plus DB migrations. Husky/lint-staged is
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
tokens/typography/Russian formatting from `docs/design.md` via `packages/ui`. Screens:
`/register`, `/login`, `/me` + `/me/profile` + `/me/rides` + `/me/notifications`,
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
(still inert — `coverImageUrl` is always `null` until CR-086).

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
detail), `registrations` (its own capability module, `POST`/`DELETE
/v1/rides/:id/register` — capacity + duplicate protection via one `SELECT ... FOR
UPDATE` row lock; `POST`/`DELETE /v1/rides/:id/waitlist` (CR-036) — joining requires
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
way on failure. Auth endpoints are rate-limited in-memory only (KI-014). `reviews`
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
`reviews`.

**packages/types**: shared Zod contracts + domain types for everything above;
`ProblemDetails`/`Paginated<T>` (ADR-011).

**packages/ui**: design tokens (light/dark, `docs/design.md` §3-5), Russian formatters

- terminology (§6-7, §13), component set — `MetricTile`/`MetricRow`, `StatusBadge`,
  `DifficultyScale`, `Skeleton`, `EmptyState`, `ErrorState`, `Button`/`Input`/
  `FormField`/`Card`/`Textarea`.

**packages/maps-core / packages/maps-2gis**: provider-neutral `MapProvider` interface
(ADR-010) + a 2GIS REST adapter (geocode/reverseGeocode/getRoute, no SDK dependency).
No live 2GIS credential exists in this environment, so every map-rendering surface
(discovery map, route map) shows a real, live-verified degraded state (KI-031) rather
than an actual MapGL render. `fetchJson` now retries once and shares one `CircuitBreaker`
across all three methods (CR-049, below), replacing its previous timeout-only logic.

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
Security foundations: one ticket remains, CR-058 (Redis-backed, per-account auth
rate limiting), blocked on KI-014 until a live Redis is reachable in this
environment — also now has a second reason to check when unblocked: KI-044
(whether `apps/api` sees each real client's IP through the new Caddy→web→api
hop, not just `web`'s internal one). Deployment: CR-074/075/076/077/079
(Dockerfiles; Caddy reverse proxy/TLS/resource limits/restart policy,
ADR-018; migrations as an explicit, concurrency-safe deploy step; Redis
password + AOF persistence; request-id correlation + error-reporting funnel)
are all closed. CR-078 (Postgres backups), CR-080 (CI gaps), CR-081 (full
prod env var set + deployment docs), CR-082 (pin MinIO/review base images)
remain open, no fixed order decided among them yet. KI-046 (CR-079,
still open — CR-077's scope was the local-dev `docker-compose.yml`, not
this file): `docker-compose.prod.yml` passes an unset `REDIS_URL`/
`S3_ENDPOINT` through as an empty string, which their bare
`.url().optional()` schema rejects — worth folding into CR-081, the next
ticket that touches production env vars.

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
- Rate limiting is in-memory per-IP-only, single-instance, no per-account limiting,
  API-wide (KI-022, narrowed) — CR-058 upgrades this once KI-014 (Redis unverified in
  this environment) is resolved, and should also settle KI-044 (new, CR-075):
  whether `apps/api` sees each real client's IP or just `web`'s single internal
  one through the new Caddy→web→api hop is unverified. `apps/api`'s production
  boot crash on
  `db`/`types`'s raw-TS-source exports (KI-017) and missing `@fastify/helmet`
  security headers (the other half of KI-022) are both now resolved (ADR-017,
  CR-061) — `packages/maps-2gis` still exports raw source too, unaffected by
  ADR-017 (nothing in `apps/api` consumes it yet, so it was never actually
  blocking).
- No live 2GIS credential — geocoding and MapGL rendering are unverified against a
  real account; every map surface shows a real degraded state instead (KI-016,
  KI-031). No geocode-by-address UI (KI-032); a ride's finish point has no coordinates
  (KI-033); route points have no participant-facing UI yet, API + organizer management
  only, pending real map rendering (KI-036).
- No `/verify-email` web screen exists yet (API-only) — an organizer who needs it has
  no in-app recovery path (KI-026). Same gap for password reset (KI-042, CR-060): API-only,
  and unlike verify-email's dev-only link, the reset token is never exposed over HTTP in
  any environment (no-account-enumeration requirement) — real end-to-end use needs
  ADR-007's still-Pending email delivery, not just a screen.
- Notification delivery (CR-038..041) now enqueues onto a real `bullmq`/Redis queue
  when `REDIS_URL` is configured (CR-050, KI-040 resolved); falls back to the
  pre-CR-050 direct synchronous insert when it isn't. Live Redis reachability
  itself is still unverified end to end in this environment (KI-014, Docker
  unreachable) — this session only verified the unreachable-Redis behavior (bounded,
  logged, never hangs).
- `GET /health` (CR-051) live-verified in this environment: real Postgres reachable
  (`db: "ok"`), Redis/S3 genuinely unreachable (`redis`/`s3`: `"error"`) — always
  `200`, distinguishing a live dependency from an actual failure exactly as
  documented. The reachable-Redis/S3 round trip itself is still unverified
  end to end (same KI-014/KI-015 gap, unrelated to this endpoint's own correctness).
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
  `packages/ui`, for any future structurally-complex primitive (KI-020); avatar/logo
  upload needs the S3 pipeline (KI-023).

## Do not break

- documented stack;
- domain terminology;
- API/database boundaries;
- the API contract shape: `/v1`, cursor pagination, RFC 9457 errors (ADR-011);
- `timestamptz` + ride-local timezone (ADR-012);
- session revocation semantics and the single-origin/no-CORS posture (ADR-013);
- server-side registration invariants;
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
  don't relax it to accept an arbitrary client-supplied value verbatim.

## Last updated

2026-09-18 (CR-077)
