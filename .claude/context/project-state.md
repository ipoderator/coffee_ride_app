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
`/health`-banner scoping decision) are all done. Post-MVP product work on top:
pace groups (`RideGroup`, ADR-022) and a rider list (CR-115…CR-120,
2026-09-23), CR-125 (2026-09-24): real first/last name on `User` and a
per-ride participants-visibility toggle, CR-126 (2026-09-24): the
rider-profile card — `profileVisibility` (3-tier, ADR-023), a new `Bike`
entity ("garage"), self-reported distance stats, and `GET /v1/rides/:id/
riders/:registrationId/profile`/`.../avatar`, reachable from the riders
list — and CR-130 (in progress, 2026-09-24): the «Ночной старт» visual
direction (ADR-024), replacing «Топокарта» (ADR-021).

## Current task

**CR-130 «Ночной старт» (ADR-024) — in progress, uncommitted.** Full plan:
`.claude/plans/delightful-skipping-lovelace.md`. Phase 1 (foundation) done;
Phase 2 (screens) partly done — see `docs/tasks.md`'s CR-130 entry and
`.claude/context/current-task.md` for the exact checklist. Remaining before
this task closes: organizer recent-registrations list + per-day bar chart
(data-availability check first), mobile bottom tab bar, countdown timer in
`RegistrationButton`'s registered state, then final `pnpm typecheck/lint/
test` across the repo and a `docs/changelog.md` entry marking it done.

CR-121…CR-129 are committed (`9adb797`, `42330fa`, `3fe806b`, `c685310`).
Full detail on those: `docs/changelog.md`'s «2026-09-23 — CR-115…CR-120»
through «2026-09-24 — CR-129» entries, ADR-021 (superseded by ADR-024),
ADR-022, ADR-023.

**Visual direction: «Ночной старт» (ADR-024, 2026-09-24, replaces ADR-021's
«Топокарта»).** Dark is the default theme. Three brand roles instead of one
overprint ink: `primary` (AA text — links, focus ring, active tab, `#74597E`
light / `#B8A0C1` dark), `brand` (logo, route track, graphics only —
`#82668C` light / `#B8A0C1` dark, the actual locked hex per `.claude/
CLAUDE.md` "Brand color"), `primary-fill` (button fill, `#82668C` both
themes). `contour` renamed `elevation` (same role). `bg`/`bg-raised`/
`surface` are now genuinely different tones (panels have a real background,
unlike ADR-021's "no card fill" rule). Shape is pills/large radii, not a 4px
stamp. Two new fonts: Unbounded (`font-title` — ride titles/headings) and
Sofia Sans Extra Condensed (`font-num` — large metric numerals); Sofia Sans
Condensed narrows to `font-display` (labels/eyebrows only). New `RouteCover`
component draws a route-drawn dark "window" cover (isoline art + real route
track + elevation-tinted footer) on every ride card/hero instead of a flat
placeholder. Discovery gained a "Заезды/Карта" tab switch — a new
`RouteCover`-grid view alongside the unchanged ADR-021/CR-118 map-first list.
The organizer cabinet regained a desktop sidebar (`CabinetShell`'s new
optional `sidebarNavItems` prop), reversing part of CR-108 — still fed by
the same ADR-009 `ORGANIZER_NAV_ITEMS` registry, only the render changed.
`Button` `danger` is an outline; `danger-filled` (additive) is
`ConfirmDialog`'s confirm — unchanged by ADR-024. Wordmark «кофе•райд»
(CR-121, updated by ADR-024: `brand`-coloured elevation-profile mark + Golos
800, filled `brand` dot, 1.8rem; accessible name «Кофе Райд») + `app/icon.svg`
= the mark. The CR-107 "Quiet Instrument" glass treatment is still
**retired** (ADR-024 keeps the "no glass/blur" rule); the sticky mobile
registration bar is still the default, restyled to the new panel/radius
system.

**Pace groups (ADR-022).** New domain entity `RideGroup` (table `ride_groups`,
migration `0017_ride_groups`; the dev DB is at 18 migrations, `0000`–`0017`):
name 1–60 (unique per ride, case-insensitive), `paceKmh` 5–60, optional
description, dense `position`, at most 6 per ride. `registrations.group_id` and
`waitlist_entries.group_id` (nullable) reference it through a composite FK
`(group_id, ride_id) → ride_groups(id, ride_id)`. Once a ride has groups,
register / waitlist join require `groupId` (`422 group_required`,
`group_not_found`), checked inside the existing locked registration
transaction; capacity stays ride-level; a promoted waitlist entry keeps its
group. Groups stay editable until the ride is `finished`/`cancelled`.

**API changes (all additive).**

- `GET /v1/rides` items are `PublicRideListItem`: `registrationsCount`,
  `startLabel`, `routePreview` (≤ 40 `[lat, lng]`, sampled in SQL then
  Douglas–Peucker, `modules/rides/route-preview.ts`), `groups`.
- `GET/POST /v1/rides/:id/groups`, `PATCH/DELETE /v1/rides/:id/groups/:groupId`
  — owner-only (`modules/rides/ride-groups.routes.ts`/`.service.ts`);
  `409 group_has_registrations` on delete while an active registration or
  waiting entry points at the group.
- `POST /v1/rides/:id/register` and `POST /v1/rides/:id/waitlist` take optional
  `groupId`; new `PATCH /v1/rides/:id/register` changes one's own group.
- `GET /v1/rides/:id` gains `groups[]` with counts; organizer
  participants/waitlist items gain `group`.
- `GET /v1/rides/:id/riders` — signed-in only, display name + group of active
  participants, no ids/contacts.

**Web.** Discovery (`/`) is map-first: desktop map left + 440px list column
right, phone 45vh map strip over the list (the «Список / Карта» toggle,
`DiscoveryViewToggle` and `RideCard` are gone). Rides render as legend rows
(`RideLegendRow`: route glyph from `routePreview`, date in the ride's timezone,
«Старт: …», pace range from groups, small chips). Markers follow filter
changes (old bug fixed), pins are control rings with the start time, row
hover/focus draws that ride's route, a pin click selects its row. Ride detail
(`/rides/[id]`) is map-first (sticky 7/12 map on desktop) with a group picker
(registration blocked until a group is chosen), «Вы зарегистрированы» + «Сменить
группу», «Участники» grouped by group (anonymous viewers see the count and a
sign-in link), «Условные знаки» legend and «Скачать GPX»; `StopList` is gone.
Organizer: `/organizer/rides/[id]/groups` («Группы по темпу»: add, edit,
delete with confirm, reorder), participants page grouped by group, waitlist
shows the chosen group. `packages/ui`: `formatStartPlace` (a start point
labelled just «Старт» falls back to its description on detail, hidden on the
list) and one module-local `pluralRu` in `terminology.ts`.

**Validation (CR-120 state):** typecheck + lint clean (17/17 turbo tasks);
tests: api 417 passed + 3 skipped (with `TEST_DATABASE_URL`), web 292, ui 132,
maps-2gis 30. Screenshots reviewed at 1440 and 390 px, light and dark.

**Dev data.** Dev DB backed up to
`packages/db/backups/coffee_ride_20260923T103231Z.dump` before 0017.
«Тестовый заезд на выходные» has «Группа 1» 25 km/h and «Группа 2» 35 km/h
(inserted by SQL; its organizer's password is unknown), 13 of its 14 riders
assigned. Test accounts, all with password `CoffeeRide-test-2026`:
`test.uchastnik1.cr117@example.com`, `test.uchastnik2.cr117@example.com`,
`test.uchastnik3.cr117@example.com` (participants) and
`test.organizer.cr120@example.com` (organizer of «CR-120 · Проверка групп по
темпу», 3 groups, 4 riders). Local MinIO is stopped (`/health` shows
`s3: error`, KI-063).

**Earlier, still-current state (2026-09-22/23).** CR-114: organizer route
builder — waypoints clicked on `/organizer/rides/[id]/route`, `POST
/v1/rides/:id/route/build` routes them along 2GIS roads (bicycle); no
straight-line fallback (`no_route` → 422); apps/api maps composition point
`plugins/maps.ts` (`app.mapProvider`). **Not yet live-verified against 2GIS**
— the 2GIS REST APIs are unreachable through this machine's VPN (KI-056), so
CR-114 stays unchecked in `docs/tasks.md`. CR-113: `packages/ui` `FileInput`
in all four upload forms. CR-112: `MapHandle.fitBounds` + re-fit on resize,
`MapPolylineInput.outlineColor`. CR-108…CR-111: one global header
(`components/site/AppHeader.tsx`, cabinet dropdowns from the ADR-009
registries, `packages/ui` `NavMenu`, shared `SessionProvider`, `CabinetShell`
narrowed to the session gate), `BackLink` on every nested screen, a
системная/светлая/тёмная theme switch applied pre-hydration, and
`apps/web/next.config.ts` explicitly loading the repo-root `.env` (Next never
auto-loaded it, so every `NEXT_PUBLIC_*` var — including the MapGL key — had
been undefined in the browser). CR-103…CR-106 (dialogs/toasts, organizer
`RideSummaryWidget` + `GET /v1/rides/mine/summary`, sticky CTA, `lucide-react`
icons in the nav) remain in place; CR-107's glass layer was superseded by
ADR-021 (above).

`MapProvider.geocode`/`reverseGeocode` still has zero UI consumers (KI-032), and
discovery's filters still cover only `bicycleType` (KI-030).

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
tokens/typography/Russian formatting from `docs/design.md` via `packages/ui` — the
«Топокарта» direction (ADR-021). Theme: system/light/dark switch (CR-110), applied by
`app/layout.tsx`'s pre-hydration script. One global `AppHeader` on every route (CR-108).
Screens:
`/register`, `/login`, `/verify-email`, `/forgot-password`, `/reset-password` (last
three new, CR-099, now backed by real email delivery — CR-100, ADR-007 — though
KI-026/KI-042 stay narrowed pending a configured sender + a live-network-verified
send, see "Current task"), `/me` + `/me/profile` + `/me/rides` + `/me/notifications`,
`/organizer` (dashboard) + `/organizer/profile` + `/organizer/rides`
(list/new/[id]/edit/[id]/route/[id]/cover/[id]/groups/[id]/participants/[id]/updates),
`/` (public discovery — map-first with a legend-row list, bicycleType filter,
upcoming-only sort, CR-118) and `/rides/[id]` (public ride detail — map-first, elevation
profile, «Условные знаки» legend, group picker, «Участники», and a
`RegistrationButton` — register/cancel/join-or-leave-waitlist/change-group states,
sticky bottom bar below `md`, redirects to `/login` on 401, CR-119).
`/organizer/rides/[id]/participants` (CR-037, grouped by pace group since CR-120):
`ParticipantTable`/`WaitlistTable`, linked from `EditRideForm`.
`/organizer/rides/[id]/groups` (CR-120): `GroupsEditor`, linked from `EditRideForm`. `/me/rides`
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
above: `CabinetShell` renders a real `<main>` landmark (its own nav moved into
`AppHeader`, CR-108); `RideDetailView` is two-column at `md`+; discovery shows map
and list side by side from `lg` and stacked (map strip over list) below it, with no
toggle (CR-118); a shared `xl` max-width-1200px-centered container
wraps every page from the root `layout.tsx`; every `ErrorState` call site now
offers `onRetry`; `RideDetailView`'s cover image uses `next/image`. `/organizer/rides/[id]/cover`
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
/v1/organizers/me`. Pace groups (CR-117, ADR-022): owner-only group CRUD under
`/v1/rides/:id/groups` (`modules/rides/ride-groups.routes.ts`/`.service.ts`), `groupId`
on register/waitlist join, `PATCH /v1/rides/:id/register` (change group) and the
signed-in-only `GET /v1/rides/:id/riders` (in `registrations`). `GET /v1/rides` items
are `PublicRideListItem` with `registrationsCount`/`startLabel`/`routePreview`/`groups`
(CR-116, `modules/rides/route-preview.ts`). See "Current task" above for the list.

**packages/db**: Drizzle + Postgres. Tables: `users`, `email_verification_tokens`,
`password_reset_tokens`, `sessions`, `organizer_profiles`, `rides`, `routes`, `stops`,
`route_points`, `ride_groups` (CR-117, ADR-022), `registrations`, `waitlist_entries`,
`ride_updates`, `notifications`, `reviews`. Migrations `0000`–`0017` (latest
`0017_ride_groups`; applied to the dev DB). `scripts/backup.sh`/`scripts/restore.sh` (CR-078, new): plain
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
  `FormField`/`Card`/`Textarea`, `Avatar`, `Dialog`/`ConfirmDialog`/`Toast` (CR-103),
  `NavMenu` (CR-108), `FileInput` (CR-113), `Wordmark` («coffee◦ride», rewritten by
  CR-115). Tokens follow ADR-021 «Топокарта» (additive `surface`, `frame`, `route`,
  `route-casing`, `contour`, `warning-fill`, `info-tint`, …); `Button` has an outline
  `danger` and an additive `danger-filled`. The CR-107 glass layer (`lib/glass.ts`,
  `--glass-*`) is deleted; `--scrim` stays. Formatters gained `formatStartPlace`
  (CR-119/120 review); `terminology.ts` has one module-local `pluralRu`.

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
rides, zero console errors — KI-031's discovery half is resolved.

CR-101 (2026-09-20, resolves KI-036): the route-detail map (`RouteMapPlaceholder` →
real render) is now done too — `MapMarkerInput` gained optional `color`/`label`,
`MapHandle` gained `setPolyline`, both implemented in `packages/maps-2gis` (a
`color`/`label` marker renders as an `HtmlMarker` colored dot + glyph instead of the
plain SDK pin). Also fixed here: a per-container generation guard in
`create2GisMapRenderer` that prevents React Strict Mode's dev-only double-effect-invoke
from constructing two live `Map` instances on one container (the stale one's `destroy()`
was wiping out the surviving instance's canvas) — this had been latently present in
`DiscoveryMap` too since CR-098.

CR-107 (2026-09-22): `MapPolylineInput` gained optional `width`/`opacity` (additive, no
new ADR — same precedent as CR-101's marker `color`/`label`). `packages/maps-2gis`'s
`setPolyline` passes `width` straight through and encodes `opacity` as an alpha suffix on
a 6-digit hex `color` (MapGL's own RGBA hex support). `RouteMap.tsx` now renders at
`width: 6` instead of the renderer's own 4px default. First test file for
`packages/maps-2gis/src/render.ts` (`render.test.ts`, new) — mocks `@2gis/mapgl` to
assert `Polyline`'s constructor args directly, since this environment has no outbound
network access to actually load the real SDK.

CR-118 (2026-09-23): `MapMarkerInput` gained optional `shape` (`'dot' | 'ring'`),
`selected` and `haloColor`, `MapRenderOptions` gained `onMarkerClick` — additive, no
new ADR (`.claude/rules/maps.md` updated). Discovery pins are control rings with the
start time; route colours come from the `route`/`route-casing` tokens. The 2GIS
basemap itself stays light in the dark theme (KI-057).

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

Test counts as of CR-120 (2026-09-23): api 417 passed + 3 skipped (with
`TEST_DATABASE_URL`), web 292, ui 132, maps-2gis 30. Per-feature detail: the latest
entries in `docs/changelog.md`.

## In progress

None.

## Next

1. **Critique P0 — login bounce loses the ride (KI-064).** `/login` has no
   `?next=`, so an anonymous «Зарегистрироваться» on `/rides/[id]` sends the
   visitor to `/login` and they land elsewhere after signing in. Add a validated
   same-origin `next` parameter to login (and register) and return to the ride.
2. **2GIS dark basemap style (KI-057)** — the basemap stays light in the dark theme.
3. Commit CR-118…CR-120 (still uncommitted in the working tree).
4. CR-114 live verification against 2GIS once the VPN allows it (KI-056).

Every other `docs/tasks.md` section (Registration, Communication, Post-ride,
Quality, Resilience, Extensibility and Security foundations, Deployment, Contract &
model follow-ups) is complete; CR-114 is the only unchecked ticket.

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
- ADR-019: cover images — size/type limits, resize bound, served through an API
  proxy, never a direct S3 URL.
- ADR-020: live MapGL rendering — render-layer types in `maps-core`, one composition
  point in `apps/web` (`lib/maps/create-map-renderer.ts`).
- ADR-021: visual direction «Топокарта» replaces Calm/Quiet Instrument — paper, ink,
  one plum overprint for route + primary action only, meaning inks, Sofia Sans
  Condensed display face (`<html lang="ru">` required), 4px radius, no card shadows,
  glass retired. `danger` stays the bright red, reserved for cancellation/destructive/
  validation. Exact values: `docs/design.md` §3.
- ADR-022: pace groups are a new domain entity `RideGroup` (not a `RideRequirement`,
  `Stop` or a `Ride` field); composite FK keeps a registration's group on the same
  ride; capacity stays ride-level; max 6 groups per ride.

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
  resolved); the route-detail map is now real too (CR-101, KI-036 resolved). A ride's
  finish point has no coordinates (KI-033); route points now have a participant-facing
  UI too (CR-101's `RouteMap`), no longer organizer-only.
- `/verify-email`, `/forgot-password`, `/reset-password` screens now exist (CR-099,
  narrows KI-026/KI-042) and are live-verified end to end in dev/QA. Real email
  delivery now exists too (CR-100, ADR-007 Accepted — Unisender Go, behind
  `apps/api/src/lib/email/`), but KI-026/KI-042 stay narrowed rather than resolved:
  no sender is verified in the account yet (`EMAIL_FROM_ADDRESS` unset,
  `app.emailProvider` is `null`), and this sandbox can't resolve `unisender.ru`
  (KI-055) to exercise a real send either way. The reset token still isn't exposed
  over HTTP in any environment, by design (no-account-enumeration requirement).
- Notification delivery (CR-038..041) now enqueues onto a real `bullmq`/Redis queue
  when `REDIS_URL` is configured (CR-050, KI-040 resolved); falls back to the
  pre-CR-050 direct synchronous insert when it isn't. Live connection-level
  Redis reachability was already confirmed as of 2026-09-19 (KI-014); this
  session reconfirmed it via `GET /health` (`redis: "ok"`) — the specific
  gap KI-014 still leaves open (an enqueued job actually round-tripping
  through the `Worker` into a real `notifications` row) was not exercised
  again this session.
- `GET /health` (CR-051): as of CR-120 the local MinIO container is stopped, so
  it reports `s3: "error"` (db/redis `ok`) and uploads are unavailable locally
  until `docker compose up minio` (KI-063). The endpoint's degraded-vs-error
  distinction (always `200`, `error` only for a genuine failure,
  `not_configured` for an absent optional dependency) is unchanged.
- Discovery filters cover only `bicycleType`; distance/difficulty/price/date-range
  are deferred, no design-doc backing yet (KI-030).
- «Топокарта»/pace-group follow-ups (CR-115…CR-120): the 2GIS basemap stays light
  in the dark theme (KI-057); `routePreview` samples the full stored geometry on
  every list request (KI-058); the rider list has no avatars (KI-059); the
  discovery list's «Старт: …» only has the route-point label (KI-060); organizer
  ride sub-page links are a plain list in `EditRideForm`, not a registry (KI-061);
  pace step 0.5 is client-only (KI-062); `/login` has no `?next=` (KI-064, the
  next task).
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
- `users`/`organizers` avatar _mutations_ stay "me"-scoped only (no `:id`
  variant for either). Reads: the organizer avatar download is public and
  keyed by `:id` (`GET /v1/organizers/:id/avatar`) since an organizer's
  identity is already public via `RideOrganizerSummary`. CR-126 added the one
  other exception — `GET /v1/rides/:id/riders/:registrationId/avatar` — but
  it is _not_ a `users/:id` route: it's keyed by ride+registration, gated by
  `resolveRiderAccess`, and never resolvable from a bare user id. There is
  still no `GET /v1/users/:id` of any kind — don't add one; a cross-
  participant need goes through the ride-scoped pattern ADR-023 established,
  not a new bare-id route;
- `resolveRiderAccess` (`apps/api/src/modules/registrations/
registrations.service.ts`, ADR-023) is the one place the rider-profile/
  avatar tier logic lives — don't duplicate the `closed`/`co_participants`/
  `open` check anywhere else; both routes call it. It never selects
  `phone`/`email` regardless of tier — don't widen that select to "just this
  one extra field" later without re-reading ADR-023;
- `user_bikes`' partial unique index (`user_bikes_one_active_per_user`) is
  the actual "at most one active bike" invariant — `users.service.ts`'s
  create/update transactions unset the previous active bike as a matching
  courtesy, not the source of truth;
- the render-layer/server-provider split in `packages/maps-core`
  (`render.ts`'s `MapRenderer` vs. `provider.ts`'s `MapProvider`) — don't
  merge them onto one interface; server code must never see a render method
  (CR-098, ADR-020);
- exactly one file, `apps/web/src/lib/maps/create-map-renderer.ts`, imports
  `maps-2gis` — don't add a second import site, and don't widen its
  `eslint.config.mjs` override beyond that one `files` path;
- `DiscoveryMap`'s fallback to `RideMapPlaceholder` on a missing key or a
  failed `render()`/`load()` call — never let a map surface show a blank
  panel (`docs/design.md` §10);
- `packages/maps-2gis/src/render.ts`'s per-container `containerGeneration` guard in
  `create2GisMapRenderer` — a `render()` call whose generation gets superseded while
  the SDK is still loading must keep returning an inert no-op `MapHandle`, never
  constructing a second live `mapglAPI.Map` on a container another call already claimed
  (CR-101) — this is what keeps React Strict Mode's dev-only double-effect-invoke from
  silently blanking the map.
- no hand-written unlayered CSS class competing with Tailwind utilities — an
  unlayered rule unconditionally outranks every `@layer utilities` rule regardless of
  source order and silently breaks a caller's own `md:`-style reset (found before
  shipping in CR-107);
- `<html lang="ru">` in `apps/web/src/app/layout.tsx` — Sofia Sans Condensed's
  Russian letterforms come from `locl` and need it (ADR-021); `app/icon.svg` repeats
  the two `primary` hex values and must be kept in step with `tokens.css` by hand;
- the plum overprint (`primary`/`route`) staying reserved for the route line and the
  primary action — no second accent, no map-themed decoration (ADR-021);
- the composite FK `(group_id, ride_id) → ride_groups(id, ride_id)` on
  `registrations`/`waitlist_entries` (a group can only belong to the same ride) and
  the `group_required`/`group_not_found` checks staying inside the existing locked
  registration transaction (ADR-022);
- `GET /v1/rides/:id/riders` staying signed-in only and returning display name +
  group + (CR-126) an opaque `registrationId` — never a raw user id, email,
  phone or emergency data (ADR-022, CR-117, ADR-023);
- `DiscoveryMap`'s markers following the filtered ride list (CR-118 fixed markers
  that never updated after the first render).

## Last updated

2026-09-24 (CR-126)
