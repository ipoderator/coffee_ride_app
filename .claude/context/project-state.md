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
security/performance audits) is now fully complete too. Resilience is in progress:
CR-049 (timeout/retry/circuit-breaker utilities) and CR-050 (async notification
delivery via Redis queue) are done; CR-051/CR-052 are next.

## Current task

None active.

## Implemented

**Infra/tooling**: pnpm + Turborepo monorepo, Node 24 LTS. Git on `main`, remote
`origin` (github.com/ipoderator/coffee_ride_app, public). CI (GitHub Actions) runs
format/lint/typecheck/build/test plus DB migrations. Husky/lint-staged is
workspace-aware (each package linted with its own config). `docker-compose.yml`
defines Postgres/Redis/MinIO but has never been live-booted in this environment —
Docker's daemon is unreachable here (KI-019; see `docker-desktop-unavailable` in
Claude's project memory).

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
Cabinet shell + nav/widget registries (ADR-009) exist for both organizer and
participant sides — participant now has three entries (profile, my registrations,
notifications), organizer still has one, no feature-flag support yet (CR-054
generalizes this). CR-044/045/046/048 (Quality) landed on top of all of the
above: `CabinetShell` now renders a real `<main>` landmark with a responsive
nav (bottom tab bar at `base`, sticky side column at `md`+); `RideDetailView`
is two-column at `md`+; `DiscoveryList`/`DiscoveryViewToggle` show a combined
list+map split view at `lg`+ (both panels always mounted, the inactive one
CSS-gated `hidden lg:block`); a shared `xl` max-width-1200px-centered container
wraps every page from the root `layout.tsx`; every `ErrorState` call site now
offers `onRetry`; `RideCard`/`RideDetailView`'s cover image uses `next/image`
(still inert — `coverImageUrl` is always `null` until CR-086).

**apps/api**: Fastify 5 + Zod + RFC 9457 errors + OpenAPI (ADR-011, `/v1` prefix,
cursor pagination). Capability modules: `auth` (register/verify-email/login/logout/me,
Argon2id, DB-backed sessions per ADR-013, CSRF via Origin/Referer check on every unsafe
`/v1` method), `users` (profile PATCH), `organizers` (OrganizerProfile CRUD, create
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
`sessions`, `organizer_profiles`, `rides`, `routes`, `stops`, `route_points`,
`registrations`, `waitlist_entries`, `ride_updates`, `notifications`, `reviews`.

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

Current test counts and per-feature detail: see the latest entries in
`docs/changelog.md` rather than this file — a fixed number here goes stale the moment
the next ticket adds tests.

## In progress

None.

## Next

`docs/tasks.md` Registration (CR-032..037, CR-091), Communication (CR-038..041),
Post-ride (CR-042/CR-043), and Quality (CR-044..048) sections are all now fully
complete. Resilience is in progress: CR-049 (timeout/retry/circuit-breaker
utilities) and CR-050 (async notification delivery via Redis queue) are done.
CR-051 (health check endpoint), CR-052 (frontend degraded-state handling) are
next.

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
- Design direction (not an ADR — see `docs/design.md`): calm, low-saturation palette,
  warm neutral base with one muted teal-green accent. One exception: `danger` is a
  bright red, reserved for cancellation/failure (`StatusBadge`, `Button
variant="danger"`).

## Known limitations

Full list with IDs and next actions: `.claude/context/known-issues.md`. Headline
items:

- No deployment artifacts, observability, or a live-verified Redis/S3/Postgres in this
  environment — Docker's daemon is unreachable throughout (KI-001, KI-002, KI-003,
  KI-006, KI-014, KI-015, KI-019).
- `packages/db`/`packages/types`/`packages/maps-2gis` export raw TS source, not
  compiled `dist` — a production boot (`node dist/server.js`) is confirmed broken
  until this is resolved via an ADR (KI-017).
- No `@fastify/helmet` (or equivalent) anywhere — zero security headers on any
  `apps/api` response, API-wide, not just auth. Rate limiting is in-memory
  per-IP-only, single-instance, no per-account limiting, also API-wide.
  Re-confirmed by CR-047's full security-rules walkthrough, not just auth
  endpoints (KI-022).
- No live 2GIS credential — geocoding and MapGL rendering are unverified against a
  real account; every map surface shows a real degraded state instead (KI-016,
  KI-031). No geocode-by-address UI (KI-032); a ride's finish point has no coordinates
  (KI-033); route points have no participant-facing UI yet, API + organizer management
  only, pending real map rendering (KI-036).
- No `/verify-email` web screen exists yet (API-only) — an organizer who needs it has
  no in-app recovery path (KI-026).
- Notification delivery (CR-038..041) now enqueues onto a real `bullmq`/Redis queue
  when `REDIS_URL` is configured (CR-050, KI-040 resolved); falls back to the
  pre-CR-050 direct synchronous insert when it isn't. Live Redis reachability
  itself is still unverified end to end in this environment (KI-014, Docker
  unreachable) — this session only verified the unreachable-Redis behavior (bounded,
  logged, never hangs).
- Discovery filters cover only `bicycleType`; distance/difficulty/price/date-range
  are deferred, no design-doc backing yet (KI-030).
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
- server-side authorization checks (never UI-only — `.claude/rules/security.md`);
- the `packages/maps-core` boundary (no direct 2GIS SDK imports outside
  `packages/maps-2gis` — `.claude/rules/maps.md`);
- the loopback binding of infrastructure ports in `docker-compose.yml`;
- one shared timeout/retry/circuit-breaker implementation (`packages/resilience`,
  ADR-016) for every external integration — don't hand-roll a new ad hoc wrapper;
- notification producers falling back to a direct synchronous insert when
  `app.notificationQueue` is `null` (`REDIS_URL` unconfigured) — this is what keeps
  every existing test passing with no live Redis (CR-050);
- the queue module's own bounded timeouts (`raceTimeout` in `queue.ts`) around
  `bullmq` calls — `callWithResilience` does not bound them (no `AbortSignal`
  support), so don't "simplify" this back to a bare `callWithResilience` call;
- feature-module isolation between organizer/participant cabinet features
  (`.claude/rules/extensibility.md`).

## Last updated

2026-09-16 (CR-050)
