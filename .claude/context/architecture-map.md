# Architecture Map

## Current state

Root tooling is operational (CR-001, 2026-09-12). `apps/web` exists (CR-002,
2026-09-12): Next.js 15.5.25 (App Router, `src/` dir per `.claude/rules/
extensibility.md`), React 19.3.0, TypeScript 6.0.3 (pinned below the version
`typescript-eslint@8.70.0` supports — see `docs/changelog.md`), Tailwind CSS v4
(CSS-first config, no `tailwind.config.js`), and the shadcn/ui foundation
(`components.json`, `cn` helper, baseline neutral CSS-variable theme — real tokens
are CR-063, not yet applied).

`apps/api` exists (CR-003, 2026-09-12): Fastify 5, ESM, `@fastify/type-provider-zod`
for typed Zod route validation and auto-generated OpenAPI (`@fastify/swagger` +
`@fastify/swagger-ui` at `/docs`). Global error handler produces the RFC 9457
envelope from `docs/api.md`/ADR-011 for every non-2xx response, including Zod
validation failures mapped into `errors[]`. `/v1` prefix wired (empty — first real
route is CR-011); `GET /health` (CR-051) runs real, bounded DB/Redis/S3 checks and
always returns `200` — see the CR-051 section below for the full shape. Env
validated at startup via
Zod (`src/env.ts`, CR-073): covers the full `.env.example` surface, refuses to boot
in production on known placeholder/local values. TypeScript pinned to `6.0.3` (same
ceiling as `apps/web`).

`turbo lint/typecheck/build` pass for both. Vitest is now wired for both
(CR-008, 2026-09-12): `apps/api` tests drive `buildApp()` through Fastify's
`.inject()` (no real port bound); `apps/web` uses jsdom + React Testing
Library. `apps/web` also has Playwright for e2e (`playwright.config.ts` +
`e2e/`), live-verified against a real `next dev` server but not wired into
CI yet (KI-007/CR-080).

`packages/db` exists (CR-004, 2026-09-12): Drizzle ORM (`postgres-js` driver) +
`drizzle-kit`. Tooling only — **zero domain tables** (user picked this over
shipping a `users` table now); `src/client.ts` exports a `createDbClient(
connectionString)` factory (a library, not a global env-reading singleton —
`apps/api` will own the actual `DATABASE_URL` and call this when a route needs
it, starting CR-011); `src/migrate.ts` is the standalone migration-runner script
CR-076's deploy step reuses later. Validated live against a real local Postgres
(Docker wasn't available in this environment — see `docs/changelog.md`): a
scratch table was generated, migrated, queried through `createDbClient`, then
fully removed, leaving the committed `migrations/meta/_journal.json` at its
genuine drizzle-kit-initialized empty state. TypeScript pinned to `6.0.3` (same
ceiling as `apps/web`/`apps/api`); needed an explicit `"types": ["node"]` in its
tsconfig — see KI-013.

`apps/api` also gained a Redis client factory (CR-005, 2026-09-12,
`src/redis.ts`): `ioredis` (chosen for future BullMQ compatibility — CR-050's
notification queue), same factory shape as `createDbClient`. Not wired into
any route (ADR-004: only when justified — CR-050/CR-058). Live connection not
verified this session — Docker's daemon didn't come up and no local Redis was
available; see KI-014.

...and an S3 client factory (CR-006, 2026-09-12, `src/s3.ts`):
`@aws-sdk/client-s3` (portable across every S3-compatible provider — ADR-005
leaves the production one deployment-specific — rather than MinIO's own
client), `forcePathStyle: true` for MinIO/non-AWS compatibility. Same factory
shape, same "not wired in yet" discipline (first consumer is CR-027 GPX
upload or CR-086's cover image pipeline). Live connection also not verified —
Docker's daemon has now failed to come up across all three of CR-004/CR-005/
CR-006 in this environment (KI-015; recorded as a standing constraint in
Claude's project memory, not re-investigated per task).

`packages/config` (CR-007, 2026-09-12): shared tooling for future Node
packages, not itself in `.claude/rules/architecture.md`'s package list. A
Node-library tsconfig fragment (`tsconfig/node-library.json` — module/
moduleResolution `NodeNext`, `"types": ["node"]`, closing KI-013/KI-R06
forward) and an ESLint flat-config factory (`eslint/node-library.js`,
`nodeLibraryConfig()`) that replace the copy-pasted recommended-configs
block `packages/db`/`apps/api` each hand-wrote. `apps/web`/`apps/api`/
`packages/db` are not retrofitted onto it (predate it, not currently
broken — left as optional future cleanup).

`packages/types` (CR-007): `ProblemDetails` (RFC 9457 envelope) and
`Paginated<T>` (ADR-011 cursor pagination) — the two API contract shapes
ADR-011 already fixed. No domain entity types yet (mirrors `packages/db`'s
zero domain tables; the first lands with CR-011). Pure `interface`s, fully
erased at compile time — zero runtime footprint, so it can never have a
cross-package runtime-resolution question regardless of packaging. Real
consumer already wired in: `apps/api`'s error handler imports
`ProblemDetails` from here (`import type`, confirmed erased in the compiled
`dist` output) instead of declaring its own copy.

`packages/ui` (CR-007, content since CR-063/CR-064/CR-065/CR-066): design tokens
(`src/tokens.css`, CSS custom properties consumed by `apps/web` via a real
package `exports` entry), Russian number/unit formatters + UI terminology
mapping (`src/format.ts`/`src/terminology.ts`, `docs/design.md` §7/§13), the
metric presentation components (`src/components/{MetricTile,MetricRow,
StatusBadge,DifficultyScale}.tsx`, §6), the shared state primitives
(`src/components/{Skeleton,EmptyState,ErrorState}.tsx`, §10 — CR-066, the last
Design-foundations task), plus a shared `cn` helper (`src/lib/cn.ts`). Vitest
switched from CR-064's `node`-environment fragment to a package-local jsdom +
Testing Library config once components needed real DOM rendering (71 tests
across 9 files, CR-066). All re-exported from `src/index.ts` (was `export {}`
through CR-007). `apps/web` doesn't import any of these into a real screen yet
(no real screen exists before CR-011), but Tailwind scans `packages/ui/src`
regardless, via an `@source` directive added to `apps/web/src/app/globals.css`
(KI-R10) — found because Tailwind v4's automatic content detection never
crosses into a sibling monorepo package on its own, which silently dropped
every one of `packages/ui`'s own Tailwind classes until fixed. CR-066 also
found that `ErrorState` needs `'use client'` (it wires its own retry
`onClick`) — a Next.js App Router Server Component cannot pass a function
prop through a component that isn't itself a Client Component boundary.
CR-066 hand-vendored `Skeleton` (a real shadcn-registry primitive, unlike any
of CR-065's four) directly against these tokens rather than resolving KI-020
(shadcn CLI's vendoring-target question) — a scoped workaround for one trivial
component, not a general resolution; KI-020 stays open for the first
structurally complex primitive a future CR needs. Design-foundations phase
(CR-063..CR-066) is now complete — CR-011 is the first real consumer.

`packages/maps-core` (CR-007): the `MapProvider` interface (`geocode`,
`reverseGeocode`, `getRoute`) plus `LatLng`/`GeocodeResult`/`RouteRequest`/
`RouteResult`, transcribed verbatim from `.claude/rules/maps.md`'s already-
fixed contract (ADR-010). Zero vendor imports, zero runtime code.

`packages/maps-2gis` (CR-007): implements `MapProvider` by calling 2GIS's
Geocoder and Routing REST APIs directly via native `fetch` — no npm SDK
dependency, so there is nothing to keep out of domain types beyond what the
`MapProvider` boundary already isolates. Every call has an explicit timeout
and normalizes failures into one `MapProviderError`; bounded retries/circuit
breaker are deferred to CR-049. Not wired into any route yet (same
discipline as the Redis/S3 clients, CR-005/CR-006). Two recorded gaps:
response field names are unverified against a live 2GIS account (KI-016),
and its `package.json` exports raw TS source rather than compiled `dist`
output, which works today only because nothing yet imports its real runtime
code from a plain-`node`-executed path (KI-017, shared with `packages/db`).
Now has 11 Vitest unit tests (CR-008, 2026-09-12) against `create2GisMapProvider`
with `fetch` mocked — verifies this adapter's own parsing/fallback/
normalization logic, not 2GIS's real response shape (KI-016 stays open).

`packages/config` (CR-008 addition): a third shared fragment,
`vitest/node-library.js` (plain JS, same reasoning as the ESLint one), for
`apps/api`/`packages/maps-2gis` to share a Vitest `test` block. Its tsconfig
fragment (`tsconfig/node-library.json`) no longer extends
`tsconfig.base.json` itself — see KI-018 — every consumer now extends both
directly as a TS 5+ array.

`packages/db` gained its **first domain tables** (CR-011, 2026-09-13): `users`
and `email_verification_tokens` (`src/schema/`), migrated via
`drizzle-kit generate` and live-applied against a local scratch Postgres
database. `apps/api` gained its **first capability module**,
`src/modules/auth/` (`.claude/rules/architecture.md`'s feature-boundary list —
`password.ts`/`tokens.ts`/`auth.service.ts`/`auth.routes.ts`), its first real
`/v1` routes (`POST /v1/auth/register`, `POST /v1/auth/verify-email`), a `db`
plugin decorating the Fastify instance (mirroring `redis.ts`/`s3.ts`), and
`@fastify/rate-limit` (global lenient default + a stricter per-route tier on
auth). `packages/types` gained its **first domain type** (`User`) and **first
real runtime dependency** (`zod`, for the shared register/verify-email
contract — previously pure erased `interface`s). `packages/ui` gained its
**first form primitives** (`Button`/`Input`/`FormField`/`Card`). `apps/web`
gained its **first real screen** (`/register`, `src/features/auth/register/`
— `.claude/rules/extensibility.md`'s feature-module shape) and its first
`next.config.ts` customization: `rewrites()` (`/api/v1/*` → `API_INTERNAL_URL`,
ADR-013 single-origin) and a webpack `resolve.extensionAlias` (`packages/types`
is `apps/web`'s first bundler-bundled workspace package written for `tsc`'s
NodeNext `.js`-suffixed-imports-of-`.ts`-files convention, which webpack
doesn't understand without this). Confirmed live this session: `apps/api`'s
compiled `dist/server.js` cannot boot under plain `node` once a package like
`db` has a real runtime (not type-only) consumer — KI-017, now a confirmed
blocker rather than a predicted risk, deferred pending an ADR (dist-based
package exports vs. bundling `apps/api`'s own build).

`packages/db` gained its **second domain table** (CR-012, 2026-09-13):
`sessions` (`src/schema/session.ts` — `userId` FK cascade, `tokenHash`
unique, `expiresAt`/`lastUsedAt`/`revokedAt`, per ADR-013's fixed column
list), migrated and live-applied against the same local scratch Postgres.
`apps/api`'s `modules/auth/` gained `session.ts` (create/validate/revoke,
rolling expiry) and `loginUser` in `auth.service.ts`; two new cross-cutting
plugins landed alongside the existing `db`/`error-handler`/`openapi` ones:
`plugins/auth.ts` (`requireAuth` preHandler + `request.user`/`sessionId`
module augmentation — opt-in per route, not global) and `plugins/csrf.ts`
(Origin/Referer preHandler, registered as `v1Routes`'s own hook so it scopes
to exactly `/v1`, `/health` unaffected). `app.ts` gained `@fastify/cookie`
(no signing secret — the cookie carries only an opaque token, checked only
via its DB-stored hash). New required env var `WEB_ORIGIN` (the CSRF check's
comparison value). Three new `/v1/auth` routes: `POST /login`, `POST
/logout`, `GET /me`. KI-022's CSRF/cookie gap is now closed; its rate-limiting
and `@fastify/helmet` gaps remain open (CR-058/CR-061).

`packages/db`'s `users` table gained three nullable profile columns (CR-013,
2026-09-14): `displayName`/`phone`/`bio` (additive migration, no new table).
`apps/api` gained its **second capability module**, `src/modules/users/`
(`.claude/rules/architecture.md`'s feature-boundary list — `users` is
distinct from `auth`): `PATCH /v1/users/me` (`users.routes.ts`/
`users.service.ts`), plus `user-response.schema.ts` — the one shared "user
over the wire" Zod shape `auth.routes.ts` now imports too, instead of each
module declaring its own copy. `auth.service.ts`'s `toPublicUser` extended to
include the new fields everywhere it already runs (register/login/
verify-email/me), so `GET /v1/auth/me` returns the full profile — no separate
`GET /v1/users/me` (CLAUDE.md: no duplicate concepts). Found and fixed two
real bugs surfaced by this session's fourth `apps/api` Vitest file:
`plugins/db.ts` never closed its postgres.js connection pool on `app.close()`
(`db.$client.end()` added to an `onClose` hook — a genuine resource leak,
not just a test artifact); and `apps/api`'s Vitest config now sets
`fileParallelism: false` (`vitest.config.ts`), since every test file shares
one real Postgres database and an unscoped `beforeEach: DELETE FROM users`
across concurrently-running files was intermittently deadlocking/500ing once
a fourth file added enough concurrent load — same class of bug as CR-012's
TRUNCATE-deadlock fix, now closed at the file-scheduling level instead.
`apps/web` gained its first authenticated screens: `/login`
(`features/auth/login/`, the UI half of CR-012's API-only login) and the
participant cabinet's first real shell + screen — `/me` (minimal stub),
`/me/profile` (`features/participant/profile/`). New shared infrastructure
this required: `components/cabinet/CabinetShell.tsx` (resolves the session,
redirects to `/login` on 401, provides the user via
`lib/auth/current-user-context.tsx`), and `lib/cabinet/participant-nav.ts` —
the first real ADR-009 nav registry (a feature pushes a `CabinetNavItem`
descriptor via its own `nav.ts`; the shell renders the list, no per-feature
branch). `packages/ui` gained `Textarea` (bio's multi-line control — same
tier as `Input`, `docs/design.md` §9 already listed it) and login/profile/
cabinet terminology (`AUTH_TERMS` additions, new `CABINET_TERMS`/
`PROFILE_TERMS`). `apps/web/vitest.config.mts` gained a `resolve.alias` for
`@/*` (mirroring `tsconfig.json`'s path) — never needed before because no
Vitest-tested file had used the `@/...` import form until this session's new
components did (`RegisterForm`'s page used it, but pages aren't
Vitest-tested, only Playwright-tested against a real `next dev` server, which
resolves it natively).

`packages/db` gained its **third table** (CR-014, 2026-09-14): `organizer_profiles`
(`src/schema/organizer-profile.ts` — `userId` FK → `users` cascade delete, unique
index for the one-per-`User` invariant, ADR-006; `name` not null, `description`
nullable), migrated and live-applied against the same local scratch Postgres.
`apps/api` gained its **third capability module**, `src/modules/organizers/`
(`.claude/rules/architecture.md`'s feature-boundary list — `organizers` is
distinct from `users`/`auth`): `POST`/`GET`/`PATCH /v1/organizers/me`, all
`requireAuth`. `POST` additionally gates on `request.user`'s current
`emailVerified` (re-read fresh from the DB, not trusted from the session-
validation-time value) — 403 `email_verification_required` when unset, 409
`organizer_profile_already_exists` on a second create (belt-and-suspenders with
the DB's own unique index against a concurrent-create race, same pattern as
CR-011's duplicate-email handling). `packages/types` gained its **second domain
type** (`OrganizerProfile`) and `api/organizers.ts` (create/update request
schemas + response type aliases).

`apps/web`'s `CabinetShell` (`components/cabinet/CabinetShell.tsx`, CR-013) was
generalized to take a `navItems` prop instead of being hard-coded to
`PARTICIPANT_NAV_ITEMS` — `docs/design.md` §8 already states both cabinets share
one shell rendering from the feature registry (ADR-009), so this closes that gap
rather than adding a second, parallel `OrganizerCabinetShell`. (CR-127: the
shell also renders `CabinetAccountBar` — signed-in identity + «Выйти» — on
every cabinet screen; sign-out goes through `lib/auth/use-logout.ts`, shared
with `AppHeader`.) CR-130 (ADR-024) added an optional `sidebarNavItems` prop:
when a cabinet layout passes it, `CabinetShell` also renders a new
`CabinetSidebar` (desktop-only) beside `children`, fed by the same ADR-009
registry `AppHeader` reads for its own dropdown/mobile panel — today only
`app/organizer/layout.tsx` passes it (`filterEnabled(ORGANIZER_NAV_ITEMS)`);
`/me/*` omits it and keeps the CR-108 header-only layout unchanged. New
`lib/cabinet/organizer-nav.ts` registry (one entry: `/organizer/profile`); new
`app/organizer/{layout,page,profile/page}.tsx` (the bare `/organizer` route is a
minimal stub, same reasoning as CR-013's `/me` stub — real dashboard content is
CR-015) and `features/organizer/profile/` (`OrganizerProfileForm` — one
component covering both the create state, on a `GET` 404, and the edit state, on
200; loading/error states, duplicate-submit protection, server-validation-error
mapping, same discipline as `ProfileForm`). `/me` gained one small additive CTA
card linking into `/organizer/profile` — otherwise nothing in the UI links a
participant into the organizer cabinet before CR-015's dashboard exists.
`packages/ui` gained `ORGANIZER_TERMS` and organizer-related `CABINET_TERMS`
entries (nav label, CTA copy, `/organizer` stub copy) — no new components; this
screen reuses `Input`/`Textarea`/`FormField`/`Button`/`Card`/`Skeleton`/
`ErrorState` as-is.

`/organizer`'s stub `EmptyState` became a real dashboard (CR-015, 2026-09-14,
`docs/design.md` §8: "Dashboard (widgets from the ADR-009 registry)"). New
`DashboardWidget` descriptor (`apps/web/src/lib/cabinet/types.ts`, alongside
`CabinetNavItem`: `id`/`order`/`Component`) and `lib/cabinet/organizer-widgets.ts`
registry — deliberately minimal, no feature-flag field; CR-054 ("Feature registry
for dashboard nav/widgets ... + feature flags", still open) is the ticket that
generalizes this across both cabinets, not this one. One widget registers so far:
`features/organizer/profile/components/OrganizerProfileWidget.tsx`
(`organizerProfileWidget` in that feature's `nav.ts`, same file the nav-item
descriptor already lived in) — a read-only summary of the same `OrganizerProfile`
CR-014 built, reusing `getOrganizerProfile()` as-is, no new API endpoint. No
ride-related widget exists yet — `Ride` isn't in the schema until CR-017+, so
there is nothing else organizer-owned to summarize.

CR-016 ("Organizer authorization") was explicitly NOT started this session —
confirmed still blocked on `Ride`/CR-017+ existing (nothing organizer-owned to
protect an ownership check against yet); `docs/tasks.md` line for it is
untouched.

`packages/db` gained its **fourth table**, and the first fixed domain entity
`Ride` (CR-017, 2026-09-14, `docs/database.md`: owned by `OrganizerProfile`,
`organizer_id` FK `ON DELETE RESTRICT`). Scoped to "Create ride" only — a
minimal valid draft (`title`/`bicycleType`/`startsAt`/`startTimezone`/
`organizerId`/`status` NOT NULL, everything else nullable pending CR-018 "Edit
draft"; see `.claude/context/current-task.md` for the full create/edit split
rationale). Two new pg enums (`ride_status`, `bicycle_type`) and seven CHECK
constraints (every nullable numeric field's lower bound, difficulty's 1-5
range) enforce invariants at the DB level per `.claude/rules/database.md`.
`apps/api` gained its **fourth capability module**, `modules/rides/` (`POST
/v1/rides`, `requireAuth`, resolves the caller's own `OrganizerProfile`
server-side — 403 `organizer_profile_required` if none — and sets
`updatedBy`/`organizerId` from the session, never a client-supplied id).
`apps/web` gained `/organizer/rides/new` (`features/organizer/rides/`,
`CreateRideForm` — a self-contained create-only screen, unlike
`OrganizerProfileForm`'s create-or-edit pattern, since a fresh ride draft has
nothing to load back) and a new organizer nav entry (`organizerRidesNavItem`,
"Заезды") — a deliberate stopgap since no ticket yet builds the real
`/organizer/rides` list `docs/design.md` §8 describes (KI-024).

**Architecture fix, not a new decision:** `RideStatus`/`BicycleType`/
`DifficultyLevel` (originally defined in `packages/ui/src/terminology.ts`,
CR-064) moved to `packages/types/src/domain/ride.ts` — `apps/api` needed the
same enums for Zod validation and `packages/db` for its pg enums, but
`.claude/rules/architecture.md` forbids `api -> ui`. `packages/ui` gained
`types` as a real dependency (previously had none) and now re-exports the
three types from `terminology.ts` unchanged, keeping only the Russian label
maps there. New shared, feature-independent utility:
`apps/web/src/lib/datetime/zoned-time.ts` (`zonedTimeToUtcIso`) — converts a
`datetime-local` input value + an IANA zone into the correct UTC instant, no
timezone library dependency (Russia has no DST since 2014, so every zone
`RUSSIAN_TIMEZONE_OPTIONS` offers has a fixed year-round offset).

CR-088/CR-016/CR-018 (2026-09-14, `docs/changelog.md`): `modules/rides/`
gained `GET /v1/rides/mine` (the caller's own rides, any status) and `GET`/
`PATCH /v1/rides/:id` (ownership-scoped — 404 `ride_not_found` whether the id
doesn't exist or belongs to a different organizer; `PATCH` draft-only, 409
`ride_not_editable` otherwise). New shared cross-cutting utility, first of its
kind: `apps/api/src/lib/cursor.ts` (`encodeCursor`/`decodeCursor`/
`clampLimit`) — ADR-011's opaque cursor-pagination contract, implemented once
here for every future collection endpoint to reuse rather than re-deriving.
`apps/web` gained `/organizer/rides` (`features/organizer/rides/components/
RidesList.tsx` — groups the caller's rides by `RIDE_STATUSES`' order, each
card linking into the edit screen) and `/organizer/rides/[id]/edit`
(`EditRideForm` — not-found state, read-only once non-draft, fills in every
field CR-017 left `null`). `organizerRidesNavItem` now points at the list
instead of straight at `/organizer/rides/new`. `zoned-time.ts` gained the
inverse conversion, `utcIsoToZonedLocalInput` (UTC instant + zone → local
`datetime-local` value), needed to prefill the edit form. No `packages/db`
schema change — every column CR-018 needed already existed from CR-017.

CR-019 (2026-09-14, `docs/changelog.md`): `modules/rides/` gained `POST /v1/
rides/:id/publish` (`draft -> published` only — the lifecycle's later states
have no owning ticket yet, KI-025). Same ownership resolution as `GET`/
`PATCH /v1/rides/:id`, plus a new caller-level gate: `emailVerified` (403
`email_verification_required`, the same code `POST /v1/organizers/me` already
uses), closing CR-059's one remaining piece
(`.claude/rules/security.md`). Non-draft → 409 `ride_not_publishable` (a new
code, distinct from `PATCH`'s `ride_not_editable`). `apps/web`'s
`EditRideForm` gained a publish button (draft-only, next to Save) and the
same `email_verification_required` guiding-banner pattern
`OrganizerProfileForm` established. No `packages/db` schema change —
`published` already existed in the `ride_status` enum since CR-017.

CR-089/CR-020 (2026-09-14, `docs/changelog.md`): `modules/rides/` gained
`POST /v1/rides/:id/open-registration` (`published -> registration_open`,
resolving KI-025 — no ticket previously owned entering that state) and
`POST /v1/rides/:id/close-registration` (`registration_open ->
registration_closed`). Same ownership resolution as `publish` (404
`ride_not_found` either way); unlike `publish`, neither gates on
`emailVerified` — only the publish trigger is named by
`.claude/rules/security.md`. Two new 409 codes, one per action
(`ride_registration_not_openable`/`ride_registration_not_closable`).
`apps/web`'s `EditRideForm` gained two status-conditional buttons
("Открыть регистрацию"/"Закрыть регистрацию"), same pattern as CR-019's
publish button. No `packages/db` schema change — both enum values already
existed since CR-017.

CR-021 (2026-09-15, `docs/changelog.md`): `modules/rides/` gained `POST /v1/
rides/:id/cancel` (`published/registration_open/registration_closed ->
cancelled` — the only transition with three valid source statuses). Same
ownership resolution as every prior transition (404 `ride_not_found` either
way); no `emailVerified` gate. One new 409 code, `ride_not_cancellable`,
covering every other status at once (unlike the other transitions' one-code-
per-single-status pattern). No `packages/db` schema change — `cancelled`
already existed in the `ride_status` enum since CR-017. `packages/ui`'s
`Button` gained an additive `danger` variant (`docs/design.md`'s one bright-
red exception to the calm palette). `apps/web`'s `EditRideForm` gained a
"Отменить заезд" button (`variant="danger"`, rendered for the three
cancellable statuses) guarded by a native `window.confirm()` — the first
lifecycle action with any confirmation step, a deliberate departure from
CR-019/CR-020's precedent (see `docs/changelog.md`'s CR-021 entry for the
reasoning).

CR-090/CR-022 (2026-09-15, `docs/changelog.md`): `modules/rides/` gained
`POST /v1/rides/:id/start` (`registration_closed -> started`, resolving
KI-027 — same shape of gap as KI-024/KI-025) and `POST /v1/rides/:id/finish`
(`started -> finished`, the lifecycle's terminal non-cancelled state). Same
ownership resolution as every prior transition; no `emailVerified` gate. Two
new 409 codes, one per action: `ride_not_startable`/`ride_not_finishable`.
No `packages/db` schema change — both enum values already existed since
CR-017. `apps/web`'s `EditRideForm` gained "Начать заезд"/"Завершить заезд"
buttons, no confirmation guard (unlike `cancel` — both are forward-only
steps with a further continuation in the normal case). The ride lifecycle
(`draft` through `cancelled`/`finished`) is now fully implemented end to
end — every status in `packages/db`'s `ride_status` enum is reachable
through a real endpoint.

CR-023 (2026-09-15, `docs/changelog.md`): `GET /v1/rides/:id`
(`modules/rides/rides.routes.ts`) changed from owner-only to serving any
viewer — `apps/api/src/plugins/auth.ts` gained `resolveOptionalUser` (resolves
`request.user` from the cookie when present/valid, never rejects), and
`rides.service.ts`'s `getRideForOwner` was replaced by `getRideForViewer`
(owner sees any status; anyone else sees it unless still `draft`, `404
ride_not_found` either way). Response gained an additive `organizer: { id,
name }` field (`packages/types`' new `RideOrganizerSummary`/
`GetRideResponse`) — one query joins `rides` to `organizer_profiles` instead
of a separate public organizer-read endpoint. No `packages/db` schema
change. `apps/web` gained its first fully public feature module,
`features/participant/ride-detail/` (`api.ts`,
`components/RideDetailView.tsx`) and its first top-level route with no
`CabinetShell`, `app/rides/[id]/page.tsx` — renders cover/title/status/
organizer/description/start time/whichever metrics are set/price/
participant limit, omitting (not em-dashing) anything still `null`.
`packages/ui/src/terminology.ts` gained `RIDE_DETAIL_TERMS`. New KI-028:
route/stops/services/requirements/registration action have no data model
yet (CR-027..036), and no discovery screen links here yet (CR-024).

CR-028 ("Route rendering", 2026-09-15): `modules/rides/` gained `GET /v1/rides/:id/
route/geometry` (resolves KI-035, same viewer-visibility rule as `GET /v1/rides/:id`/
`.../route/download`, no S3 call — `Route.geometry` is already in the DB row from
CR-027). `apps/web` gained its **first real dependency on `packages/maps-core`**
(`docs/design.md` §9: `ElevationProfile` "consumes `packages/maps-core` types
only") — `features/participant/ride-detail/` gained `lib/elevation-profile.ts`
(pure haversine-distance + downsampling functions, `maps-core`'s `LatLng` extended
with `elevationMeters`), `components/ElevationProfileChart.tsx` (hand-built inline
SVG area chart, no charting library — `docs/design.md` §6's full spec: muted
`primary` fill, y-axis floor not forced to zero, hover/touch tooltip), and
`components/RouteMapPlaceholder.tsx` (a second, independent degraded-`ErrorState`
instance — `.claude/rules/extensibility.md` forbids reusing discovery's own
`RideMapPlaceholder` across feature modules). `/rides/[id]` gained a "Маршрут"
section, shown only when `ride.route` is non-null, with its own independent
loading/error/retry state so a geometry-fetch failure degrades locally instead of
blanking the rest of the page. No live 2GIS MapGL credential in this environment
(KI-031, widened — second surface hitting the same gap as CR-026's discovery map).

CR-029 ("Route metadata", 2026-09-15, resolves KI-034): `rides.service.ts`'s
`uploadRoute` gained this codebase's **third real `db.transaction(...)` use**
(after `auth.service.ts`'s `registerUser`/`changePassword`) — the route insert and a
conditional `Ride.distanceKm`/`elevationGainMeters` auto-fill (only whichever field
is still `null`) now commit atomically. No schema change, no new endpoint —
`features/organizer/route/`'s `RouteUploadForm.tsx` reuses the existing `PATCH
/v1/rides/:id` for its new "adopt track figures" action, reloading its full state
after every mutation instead of trusting a locally-guessed copy of the server's
auto-fill logic.

CR-030 ("Stops", 2026-09-15): `packages/db` gained its sixth table, `stops`
(`rideId` FK → `rides` `ON DELETE CASCADE`, server-assigned `position` unique
per `(rideId, position)`). `modules/rides/` gained `POST`/`PATCH`/`DELETE
/v1/rides/:id/stops(/:stopId)` — reuses `resolveOwnDraftRide` verbatim (same
draft-only ownership gate as GPX upload), one new error code
(`stop_not_found`, 404). `getRideForViewer`'s response gained an additive
`stops: Stop[]` array (ordered by `position`) — same "embed it in ride
detail, no separate read endpoint" precedent CR-027 set for `route`.
`features/organizer/route/` gained `components/StopsSection.tsx` (add/edit/
delete UI, rendered alongside `RouteUploadForm` per `docs/design.md` §8's
screen grouping); `features/participant/ride-detail/` gained
`components/StopList.tsx` (a numbered, read-only list, wired into
`RideDetailView`). No new `packages/maps-core`/`maps-2gis` dependency — a
stop's `lat`/`lng` are plain required numbers, same as `Ride.startLat/Lng`,
not yet rendered on any map (KI-031 unaffected).

CR-031 ("Route points", 2026-09-15): `packages/db` gained its seventh
table, `route_points` (`rideId` FK → `rides` `ON DELETE CASCADE`, a
`route_point_type` pg enum, no `position`/uniqueness constraint — a route
point is a typed map pin, not an ordered itinerary entry like `stops`, so
more than one marker of the same `type` is allowed). `modules/rides/`
gained `POST`/`PATCH`/`DELETE /v1/rides/:id/route-points(/:routePointId)`
— same `resolveOwnDraftRide` gate as `stops`/GPX upload, one new error code
(`route_point_not_found`, 404). `getRideForViewer`'s response gained an
additive `routePoints: RoutePoint[]` array (ordered by `createdAt`, not a
`position` column) — same embedding precedent as `stops`/`route`.
`features/organizer/route/` gained `components/RoutePointsSection.tsx`
(add/edit/delete UI with a type select, rendered alongside `StopsSection`).
No participant-facing component this ticket (KI-036) — `docs/design.md`
§8's participant ride-detail row names no route-points list, unlike
`Stop`'s explicit `StopList`; a route point is map-pin data meant for real
MapGL rendering, still blocked on KI-031's missing live 2GIS credential.
No new `packages/maps-core`/`maps-2gis` dependency, same reasoning as
`stops`.

CR-091 ("My registrations", 2026-09-16, resolving KI-037): `apps/api`'s
`registrations` capability module gained a second Fastify plugin,
`myRegistrationsRoutes` (`GET /v1/registrations/mine`), registered under its own
`/registrations` prefix in `routes/v1.ts` — distinct from `registrationsRoutes`
(mounted at `/rides`, every path nests under a specific ride) since this list has no
single-ride parent and `/v1/rides/mine` was already the organizer's own-rides list
(CR-088). `rides.service.ts`'s `toPublicRide` is now exported so
`registrations.service.ts`'s new `listMyRegistrations` can reuse the identical `rides`
row → `Ride` mapping — the same cross-module reuse direction `toRegistration`/
`toWaitlistEntry` already established the other way (rides.service.ts importing from
registrations.service.ts), so this closes the loop into a genuine (harmless, function-
values-only) import cycle between the two. Two independently cursor-paginated tabs
(`?when=upcoming|past`) rather than one page split client-side. `apps/web` gained
`features/participant/my-rides/` (`MyRidesView` — Upcoming/Past tabs, `MyRideCard` —
feature-local, not a reuse of discovery's own `RideCard` per
`.claude/rules/extensibility.md`) and `/me/rides`; the participant cabinet nav
registry now has two entries instead of one.

CR-038/039/040/041 ("Communication", 2026-09-16): `packages/db` gained its tenth
and eleventh tables, `ride_updates` (`rideId` FK → `rides` `ON DELETE CASCADE`,
`message`, `createdAt`, `updatedBy` — no edit/delete, only create + list) and
`notifications` (`userId`/`rideId` FKs cascade, `rideUpdateId` nullable FK →
`ride_updates` cascade, a `notification_type` pg enum
`registration_confirmed`/`ride_update`/`ride_cancelled`, `createdAt`, `readAt`
nullable — a CHECK enforces `rideUpdateId` non-null iff `type = 'ride_update'`).
`apps/api` gained its **first `notifications` capability module**
(`.claude/rules/architecture.md`'s feature-boundary list already named it):
`createRegistrationConfirmedNotification` (called from `registrations.service.ts`'s
`createRegistration` and from `cancelRegistration`'s waitlist-promotion branch),
`createRideUpdate`/`listRideUpdates` (`POST`/`GET /v1/rides/:id/updates`,
organizer-only, sharing the `/rides` prefix the same way `registrationsRoutes`
already does — a fourth plugin on that prefix), `notifyRideCancelled` (called
from `rides.service.ts`'s `cancelRide`), `listMyNotifications`/
`markNotificationRead` (`GET /v1/notifications/mine` + `POST
/v1/notifications/:id/read`, own `/notifications` prefix). One-directional
dependency, no new import cycle: `registrations.service.ts`/`rides.service.ts`
import from `notifications.service.ts` for the producer calls, while
`notifications.service.ts` itself imports only the `registrations`/`rides`
**schema tables** (not their service functions) for its own fan-out queries —
unlike the pre-existing `rides.service.ts` ⇄ `registrations.service.ts` cycle
(CR-091's changelog entry explains that one), `notifications` never calls back
into either. Every notification producer inserts directly into `notifications` in
the same request, immediately after (never inside) its own triggering
transaction, wrapped in `try`/`catch` (`NotificationLogger`, effectively
`app.log`) — a deliberate, documented departure from
`.claude/rules/resilience.md`'s literal "queue it via Redis" wording, since a
same-database insert isn't an external-integration call and Redis-backed queuing
is CR-050's separate, still-open scope (KI-040). `apps/web` gained
`features/organizer/updates/` (`UpdateComposer` — compose + read-only history)
and `/organizer/rides/[id]/updates`, linked from `EditRideForm`; and
`features/participant/notifications/` (`NotificationList` — one page, newest
first, click-to-read) and `/me/notifications`, the participant cabinet's third
nav entry.

CR-042/CR-043 (Post-ride) added a twelfth table, `reviews` (`rideId`/`userId` FKs
cascade, `rating` int CHECK `1-5`, `comment` nullable, `createdAt` — no
`updatedAt`/edit, a plain unique index on `(rideId, userId)`), and `apps/api`'s
first `reviews` capability module (`.claude/rules/architecture.md` already named
it, distinct from `notifications`/`ride_updates` sharing one module — this one
gets its own): `createReview`/`listRideReviews` (`POST`/`GET
/v1/rides/:id/reviews`, sharing the `/rides` prefix) plus
`getOrganizerRatingSummary`/`getOrganizerRatingSummaries` (single vs. batched
`avg(rating)`/`count(*)` join over an organizer's rides — no denormalized
column). Cross-module dependency direction, no new cycle:
`rides.service.ts`/`registrations.service.ts`/`organizers.service.ts` all import
from `reviews.service.ts` (the rating-summary functions, plus `toReview` for
`rides.service.ts`'s `viewerReview`), while `reviews.service.ts` itself imports
only the `rides`/`registrations`/`users` **schema tables**, never those modules'
service functions — same one-directional shape `notifications.service.ts`
already established. CR-043 added no new endpoint: `rating`/`reviewCount` are
additive fields on the existing `RideOrganizerSummary` embed (`GET /v1/rides`,
`GET /v1/rides/:id`) and on `GET`/`POST`/`PATCH /v1/organizers/me`. `apps/web`
gained `ReviewForm`/`ReviewList` inside the existing
`features/participant/ride-detail/` module (a new "Отзывы" section on
`/rides/[id]`, not a new route) and a rating card on `/organizer/profile`.

CR-049 (Resilience) added a ninth package, `packages/resilience` (ADR-016): a
provider-agnostic `callWithResilience` (timeout via `AbortSignal` + bounded
retry with jittered backoff, recording success/failure on an optional shared
`CircuitBreaker`) and `CircuitBreaker` itself (closed → open after N
consecutive failures → half-open single trial → closed on trial success). Zero
runtime dependencies, same "pure interface/utility, no vendor coupling" shape
as `packages/maps-core`. Two new dependency edges
(`.claude/rules/architecture.md`): `packages/maps-2gis → resilience` (its
`http.ts`'s `fetchJson` now retries once and shares one breaker across
`geocode`/`reverseGeocode`/`getRoute`, replacing its previous timeout-only
implementation) and `apps/api → resilience` (`modules/rides/route-storage.ts`'s
local ad hoc `withResilience` replaced by the shared utility + a module-level
breaker shared across the GPX upload/download/delete S3 calls). Both call
sites still normalize every failure into their own pre-existing domain error
(`MapProviderError`, `RouteStorageError`) — `ResilienceError` never reaches a
caller outside the integration module, so no downstream fallback behavior
(degraded-map-state, degraded-storage response) changed shape. CR-050
(async notification delivery)/CR-051 (health check endpoint) are done; CR-052
(frontend degraded-state handling) is the one remaining Resilience-section
ticket, still open.

CR-050 ("Async notification delivery via Redis queue", 2026-09-16) is the first
real consumer of `redis.ts`'s `createRedisClient` (KI-014, live-unverified in
this environment, stays open — Docker still unreachable). New
`apps/api/src/modules/notifications/queue.ts`: `registerNotificationQueue`
decorates `app.notificationQueue: NotificationQueue | null` — `null` when
`REDIS_URL` isn't configured, same "not configured is a degraded mode, never a
boot-time crash" shape `plugins/s3.ts` already established for `app.s3`
(KI-015). When configured, wires a `bullmq` `Queue` (producer) + in-process
`Worker` (consumer) on one `notifications` queue — the worker runs inside the
same `apps/api` Fastify process, not a second deployable service
(`.claude/rules/resilience.md`'s "do not introduce a second deployable service
'for resilience' without a new ADR"; ADR-008). `notifications.service.ts`'s
three producers (`createRegistrationConfirmedNotification`, `notifyRideCancelled`,
the fan-out inside `createRideUpdate`) now take a `queue` parameter: if
configured, they enqueue and return (the worker's job processor,
`processNotificationJob`, does the actual insert); if not, they fall back to
the exact same direct synchronous insert CR-038..041 shipped — so every
existing route-level test (none of which ever set `REDIS_URL`) keeps passing
unmodified. Live-verified against a real (unreachable) Redis, not just
reasoned about: naively awaiting BullMQ's `queue.add()`/`worker.close()`/
`queue.close()` hangs indefinitely against a genuinely unreachable Redis —
`callWithResilience`'s `timeoutMs` doesn't help here since `Queue.add()`
accepts no `AbortSignal` to race against — so `queue.ts` wraps each in a
hand-rolled `raceTimeout` (a real `Promise.race` against a plain timer) instead,
bounding both the per-request enqueue latency (1.5s) and graceful shutdown
(3s per close call) regardless of Redis reachability. A `CircuitBreaker`
(`packages/resilience`, used directly rather than through
`callWithResilience` for the same reason) short-circuits the enqueue path
after 5 consecutive failures so a sustained outage doesn't tax every request
with that same timeout. No new package/dependency-direction edge — `bullmq` is
an ordinary `apps/api` npm dependency (not a new workspace package), and
`apps/api → resilience` already existed (CR-049).

CR-051 ("Health check endpoint reporting DB/Redis/S3 status", 2026-09-16)
replaces `routes/health.ts`'s bootstrap-stub handler with real, bounded checks:
DB (a `select 1` round trip via `db.execute`), Redis (`.ping()` on a reused
connection — see below), S3 (`HeadBucketCommand`). Each dependency reports
`ok`/`error`/`not_configured`; the overall `status` is `degraded` only if any
dependency is actually `error` — an unconfigured optional dependency
(Redis/S3 in this environment, KI-014/KI-015) is not itself degraded. The route
always returns `200`, per `.claude/rules/resilience.md`'s "without dying if one
is degraded." Neither postgres.js nor ioredis honor an `AbortSignal` (the same
gap CR-050 hit for BullMQ), so this ticket extracted CR-050's hand-rolled
`raceTimeout` out of `queue.ts` into a new shared `apps/api/src/lib/
race-timeout.ts` rather than duplicating it — `queue.ts` now imports the same
helper, no behavior change. S3's `HeadBucketCommand` goes through the AWS SDK,
which does honor `abortSignal`, so that check uses `packages/resilience`'s
`callWithResilience` directly (timeout only, no retry/breaker — a diagnostic
ping, deliberately not sharing `route-storage.ts`'s upload/download/delete
breaker in either direction). `queue.ts` gained a second decoration,
`app.redis: RedisClient | null` — the same producer Redis connection
`notificationQueue` already owns, reused for the ping rather than opening a
fourth connection. No new package/dependency-direction edge.

CR-097 ("User/OrganizerProfile avatars", 2026-09-20, resolving KI-023): CR-086's
two generic image-handling modules (`cover-image.ts`/`cover-image-storage.ts`)
moved out of `modules/rides/` into `apps/api/src/lib/` as `image-processing.ts`/
`image-storage.ts` (generic names, generic `processImage`/`ImageStorageError`/
`uploadImageObject`/etc.) — `modules/rides/`, `modules/users/`, and
`modules/organizers/` are three separate capability modules, and `users`/
`organizers` importing a `rides`-owned file would be exactly the "reach into
another module's internals" `.claude/rules/resilience.md` warns against, so
this now lives beside `lib/cursor.ts`/`lib/account-rate-limit.ts` instead.
`rides.service.ts` switched its import; behavior unchanged (verified by the
full existing suite passing). A new `lib/read-upload.ts` (`readUploadedFile`/
`UploadTooLargeError`) does the same for the small "read one multipart file,
map the too-large error" helper `rides.routes.ts`'s `readGpxUpload`/
`readCoverImageUpload` each still hand-roll their own copy of — only the two
new avatar route files use the shared version; the GPX/cover-image routes were
deliberately left untouched (lower risk than refactoring an already-shipped
path for this ticket). `users`/`organizer_profiles` each gained `avatar_key`/
`avatar_content_type`/`avatar_size_bytes` columns (same shape as `rides.
cover_image_*`). New routes: `POST`/`PATCH`/`DELETE`/`GET /v1/users/me/avatar`
(fully "me"-scoped, no `:id` variant — matches this module's existing
"no `GET /me`, no public read" posture) and `POST`/`PATCH`/`DELETE /v1/
organizers/me/avatar` plus a public, unauthenticated `GET /v1/organizers/:id/
avatar` (an `OrganizerProfile`'s identity, including a photo, is already public
via `RideOrganizerSummary` — unlike a `Ride`'s draft-gated cover, there is no
visibility check to make). `RideOrganizerSummary`/`OrganizerProfile` both
gained an additive `avatarUrl` field; `rides.service.ts` and
`registrations.service.ts` (its `/v1/registrations` "my registrations" list)
both import `organizerAvatarUrlPath` from `organizers.service.ts` to compute
it — the same cross-capability-module reuse precedent those two files already
had for `reviews.service.ts`'s `getOrganizerRatingSummary(ies)`, not a new
exception. `packages/ui` gained its first real `Avatar` component (named in
`docs/design.md` §9's inventory since CR-063 but never built) plus a shared
`AVATAR_TERMS`; the actual upload UI (`AvatarUploadForm`) is duplicated once
per cabinet feature module (`features/participant/profile/`, `features/
organizer/profile/`) rather than extracted into `packages/ui` — it isn't in
design.md's fixed shared-component inventory, and this repo's existing
precedent (GPX upload vs. cover-image upload) is to keep near-identical
upload-form UI feature-local rather than force a shared abstraction. No new
package/dependency-direction edge.

CR-098 ("Live 2GIS MapGL rendering", 2026-09-20, resolving KI-031, ADR-020): a
real public `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` now exists. `packages/maps-core`
gained `src/render.ts` — `MapMarkerInput`/`MapRenderOptions`/`MapHandle`/
`MapRenderer`, provider-neutral (only `LatLng` + `HTMLElement`), kept separate
from `provider.ts`'s server-safe `MapProvider` since server code never renders
a map. `packages/maps-2gis` gained a real npm SDK dependency for the first
time, `@2gis/mapgl` — previously every method was plain-`fetch` REST, no
vendor SDK object anywhere in this package; `src/render.ts` dynamically
imports it (browser-only, no side effect outside a real `render()` call) and
converts to MapGL's own `[longitude, latitude]` coordinate order at this one
boundary. New dependency-direction edge: `apps/web` → `maps-2gis`, but through
exactly one file, `apps/web/src/lib/maps/create-map-renderer.ts` — the
composition point `.claude/rules/architecture.md` already described but that
had never actually been built (zero consumers existed before this ticket).
CR-056's `*2gis*` `no-restricted-imports` glob also matches the bare
`maps-2gis` specifier, so `apps/web/eslint.config.mjs` gained a `files`-scoped
override for exactly this one path. New `DiscoveryMap` client component
(`features/participant/discovery/components/`) replaces `RideMapPlaceholder`
on `/`'s map view, plotting each published ride's `startLat`/`startLng`;
`RideMapPlaceholder` itself is kept, now serving as the fallback for a missing
key or a failed render (`docs/design.md` §10's degraded-state requirement).
Route-detail map rendering (`RouteMapPlaceholder`) is unchanged — deliberately
scoped out this session, done in CR-101 below. Also fixed, found live this
session: the native dev `DATABASE_URL` database had never had migration
`0016_avatar_columns.sql` (CR-097) applied, causing `GET /v1/rides` to 500 —
ran `pnpm --filter db db:migrate` against it (KI-051, resolved same session).

CR-099 ("Fix findings from a user-run QA pass", 2026-09-20): `apps/web` gained
a new `(public)` route group (`app/(public)/layout.tsx`) wrapping `/`,
`/register`, `/login` — same three routes, moved in unchanged — rendering a
new shared `components/site/SiteHeader.tsx` (a plain Server Component, no
client state). Deliberately not applied to `/organizer/*`/`/me/*`
(`CabinetShell` already owns their nav) or `/rides/[id]` (outside this
ticket's reported gap). `features/auth/` gained three new modules
(`verify-email`, `forgot-password`, `reset-password`), same `api.ts` +
component + `page.tsx` shape as the existing `register`/`login` — each calls
an endpoint that already existed (`auth.routes.ts`'s `/verify-email`,
`/forgot-password`, `/reset-password`) but previously had no web screen
(KI-026/KI-042, both narrowed, not fully resolved — real usability still
depends on ADR-007's pending email delivery). `app/organizer/rides/[id]/
loading.tsx` (new) is this codebase's first per-segment Next.js loading
boundary — every prior route relied solely on its own client component's
`Skeleton`, which only covers the gap after that component mounts, not
during the RSC navigation that precedes it. `apps/web/src/app/layout.tsx`
gained a `beforeInteractive` inline script activating `packages/ui`'s
already-defined `.dark` token set from `prefers-color-scheme` — no new
dependency, no manual toggle, just the missing activation for tokens that
had existed unused since CR-063.

CR-100 (ADR-007, "Real email delivery via Unisender Go", 2026-09-20): `apps/api`
gained its first email integration, `src/lib/email/{email-provider,unisender-
provider}.ts` — an `EmailProvider` interface + real Unisender Go implementation,
wrapped in `packages/resilience`'s `callWithResilience` (timeout + circuit
breaker, no retry — email send isn't idempotency-safe). No new workspace
package (unlike maps' `packages/maps-core`/`maps-2gis` split, ADR-010): only
`apps/api` ever sends email, so this stays a module inside `apps/api`, same
"single consumer, adapter-shaped, not a new package" precedent
`route-storage.ts`'s S3 wrapper already set. New `src/plugins/email.ts`
decorates `app.emailProvider` (`null` when unconfigured — same degraded-mode
shape as `app.s3`). Delivery reuses `modules/notifications/queue.ts`'s
existing CR-050 BullMQ queue rather than a parallel mechanism: two new job
names (`verification_email`/`password_reset_email`), `processNotificationJob`
gained an `emailProvider` parameter. `auth.routes.ts`'s register/
forgot-password handlers call the new producers with a real
`${WEB_ORIGIN}/verify-email?token=...`/`${WEB_ORIGIN}/reset-password?
token=...` URL — the same web pages CR-099 built. Not fully resolved yet: no
`EMAIL_FROM_ADDRESS` configured (`app.emailProvider` still `null` in this
environment) and `unisender.ru` fails DNS resolution from this sandbox
(KI-055) — a real send has never been exercised live, only against mocked
`fetch` matching the real Unisender Go request shape (verified against the
`django-anymail` backend source).

CR-101 ("Route-detail map rendering", 2026-09-20, resolving KI-036): `packages/
maps-core/src/render.ts`'s `MapMarkerInput` gained optional `color`/`label`;
new `MapPolylineInput`; `MapHandle` gained `setPolyline(polyline:
MapPolylineInput | null): void` — additive extension of ADR-020's render-layer
contract, no new ADR (KI-036 itself named this exact extension in advance).
`packages/maps-2gis/src/render.ts` implements both: a marker with `color`/
`label` renders as an `HtmlMarker` (a small colored `<div>` with a one-glyph
text label) instead of the SDK's plain `Marker` pin; `setPolyline` draws/
clears one `Polyline`. New `apps/web/src/lib/maps/css-color.ts`
(`getCssColorVar`) resolves a `packages/ui` design-token CSS custom property
to its current computed value at call time — the one sanctioned exception to
"never a raw hex literal" (a map SDK draws on canvas, not the DOM, so it can't
consume a Tailwind class, but reading the same token via `getComputedStyle`
keeps it theme-aware and ESLint-compliant). New feature-local `apps/web/src/
features/participant/ride-detail/lib/route-point-colors.ts` maps each
`RoutePointType`/`Stop` to a token CSS var + glyph. New `RouteMap.tsx`
(same feature directory) mirrors `DiscoveryMap`'s pattern and replaces
`RouteMapPlaceholder` as `/rides/[id]`'s default route-map state (the
placeholder itself stays, now as the fallback for a missing key/failed
render, same role `RideMapPlaceholder` plays for discovery).

Also found and fixed here, in `create2GisMapRenderer` (shared by both
`DiscoveryMap` and `RouteMap`): a `containerGeneration` `WeakMap<HTMLElement,
number>` guard against React Strict Mode's dev-only double-`useEffect`-invoke
constructing two live `mapglAPI.Map` instances on one container before either
call's async SDK load resolves — previously, the stale instance's later
`destroy()` call cleared the container's DOM out from under the surviving
instance. `DiscoveryMap` carried this same exposure since CR-098 without ever
hitting it in a prior live check; the fix lives once in the adapter, so both
callers are covered without their own effect code changing.

## Target structure

apps/

- web/ ← exists (CR-002)
- api/ ← exists (CR-003)

packages/

- db/ ← exists (CR-004)
- types/ ← exists (CR-007)
- ui/ ← exists (CR-007, empty)
- config/ ← exists (CR-007, shared tooling)
- maps-core/ ← exists (CR-007; provider-neutral map interface — ADR-010)
- maps-2gis/ ← exists (CR-007; 2GIS adapter, only package allowed to speak to 2GIS;
  CR-098 added a real SDK dependency, `@2gis/mapgl`, for browser MapGL rendering)

## Web responsibilities

Next.js UI, route pages, forms, map UI, typed API client.

## API responsibilities

Fastify routes/controllers, validation, use cases/services, authorization, persistence orchestration.

## DB responsibilities

PostgreSQL schema, Drizzle client, migrations.

## Shared responsibilities

Types/contracts and reusable UI.

CR-114 ("Route builder"): `apps/api` got its own maps composition point,
`src/plugins/maps.ts` — decorates `app.mapProvider` (`MapProvider | null`, null
without `MAPS_2GIS_API_KEY`), same decorate-or-null shape as `plugins/email.ts`.
New dependency edges: `apps/api` → `maps-core`/`maps-2gis`, the latter only through
that one file (a `files`-scoped `no-restricted-imports` override in
`apps/api/eslint.config.mjs`, mirroring apps/web's). Both map packages gained a
`./server` subpath entry (everything except the DOM-typed render layer) — apps/api
imports only from `maps-core/server`/`maps-2gis/server`. `MapProviderError` moved to
`maps-core` (with a `code: 'unavailable' | 'no_route'`) so a caller can branch on it
without importing an adapter; `maps-2gis` re-exports it. `rides.service.ts`'s
`buildRoute` + `POST /v1/rides/:id/route/build`; web side is
`features/organizer/route/components/RouteBuilder.tsx` on the organizer route page.

CR-115…CR-120 («Топокарта» redesign + pace groups + rider list, 2026-09-23, ADR-021,
ADR-022). No new package and no new dependency-direction edge; one new domain entity.

- **packages/db**: `src/schema/ride-group.ts` (`ride_groups`), migration
  `0017_ride_groups` (18 migrations total). `registration.ts`/`waitlist-entry.ts`
  gained nullable `groupId` with a composite FK
  `(group_id, ride_id) → ride_groups(id, ride_id)`.
- **packages/types**: `domain/ride-group.ts`, `api/ride-groups.ts` (group CRUD
  contracts, `RideGroupRef`, the riders list); `api/rides.ts` gained
  `PublicRideListItem` (`GET /v1/rides` items: `registrationsCount`, `startLabel`,
  `routePreview`, `groups`) and `groups[]` on ride detail; `api/registrations.ts`
  gained the optional `groupId` body, the change-group request and `group` on
  participant/waitlist items.
- **apps/api** (`modules/rides/`): `ride-groups.routes.ts` + `ride-groups.service.ts`
  (owner-only `GET/POST /v1/rides/:id/groups`, `PATCH/DELETE .../groups/:groupId`,
  registered in `routes/v1.ts` under the `/rides` prefix, locks the `rides` row like
  every other ride-child mutation); `route-preview.ts` (Douglas–Peucker over an
  SQL-sampled route, used by `rides.service.ts`'s batched list extras).
  `modules/registrations/` owns the group rules on register/waitlist join,
  `PATCH /v1/rides/:id/register` and `GET /v1/rides/:id/riders` — the registration
  transaction stays in one module; `ride-groups.service.ts` touches
  `registrations`/`waitlist_entries` only for group counts, the
  `group_has_registrations` refusal and clearing `groupId` on historical rows when
  a group is deleted.
- **apps/web**: new feature module `features/organizer/groups/` (`api.ts`,
  `types.ts`, `validation.ts`, `hooks/useRideGroups.ts`, `components/GroupsEditor.tsx`,
  `components/GroupForm.tsx`) behind the new route `app/organizer/rides/[id]/groups/page.tsx`;
  `features/organizer/participants/group-sections.ts` groups the participants table.
  Discovery (`features/participant/discovery/`): `RideLegendRow`,
  `RoutePreviewGlyph`, `ContoursIllustration` (empty state) and `lib/route-preview.ts`
  (fits `routePreview` into the glyph's SVG box); `RideCard.tsx` and
  `DiscoveryViewToggle.tsx` are deleted. Ride detail
  (`features/participant/ride-detail/`): `GroupPicker`, `RidersSection`,
  `RouteLegend`, `lib/use-route-geometry.ts` (one geometry fetch shared by the map and
  the elevation profile); `StopList.tsx` is deleted. `app/icon.svg` is the ring-only
  favicon. The organizer ride sub-pages (Маршрут, Обложка, Группы, Участники,
  Обновления) are still a plain link list in `EditRideForm`, not a registry (KI-061).
- **packages/ui**: `Wordmark` rewritten («coffee◦ride», Sofia Sans Condensed),
  `lib/glass.ts` deleted (and its `index.ts` export), tokens rewritten per ADR-021,
  `Button` `danger-filled` variant, `format.ts`'s `formatStartPlace`, one module-local
  `pluralRu` in `terminology.ts`.
- **packages/maps-core / maps-2gis** (render layer only): additive
  `MapMarkerInput.shape`/`selected`/`haloColor` and `MapRenderOptions.onMarkerClick`,
  implemented in `maps-2gis/src/render.ts` (`.claude/rules/maps.md` updated). The
  `create-map-renderer.ts` composition point is unchanged.

CR-126 (rider profile: privacy tiers, garage, self-reported distance stats, recent
rides, 2026-09-24, ADR-023). No new package; one new domain entity, one new
cross-participant access pattern (`resolveRiderAccess`) that any future
cross-user feature should reuse rather than re-deriving.

- **packages/db**: `src/schema/bike.ts` (`user_bikes`, FK → `users`, reuses
  `ride.ts`'s `bicycleTypeEnum`), migration `0019_real_steve_rogers` (19
  migrations total). `user.ts` gained `profileVisibilityEnum` +
  `profileVisibility`/`distanceWeekKm`/`distanceMonthKm`/`distanceYearKm`.
- **packages/types**: `domain/bike.ts` (`Bike`, `BikeType`/`BIKE_TYPES` —
  narrower than `Ride`'s `BicycleType`, excludes `'any'`), `api/bikes.ts`
  (bike CRUD contracts), `api/rider-profile.ts` (`RiderProfile`,
  `GetRiderProfileResponse`); `domain/user.ts` gained `ProfileVisibility`/
  `PROFILE_VISIBILITIES` and the new `User` fields; `api/ride-groups.ts`'s
  `RideRider` gained `registrationId`.
- **apps/api**: `modules/users/` gained `me`-scoped bike CRUD
  (`users.service.ts`/`users.routes.ts`, exports `toBike` for cross-module
  reuse — same "share a mapper across modules" precedent as `rides.service.ts`'s
  `toPublicRide`). `modules/registrations/registrations.service.ts` gained
  `hasActiveRegistration`, `resolveRiderAccess` (the one access-tier gate),
  `getRiderProfile`, `getRiderAvatarDownload`, and `listRiders`'s
  `registrationId` field; two new routes on `registrations.routes.ts`
  (`.../riders/:registrationId/profile`, `.../avatar`), same `/rides` prefix
  as every other registrations route.
- **apps/web**: extended `features/participant/profile/` (`ProfileForm.tsx`
  privacy/distance fields, new `GarageForm.tsx`) — not a new module, same "my
  own profile" surface. New feature module `features/participant/
rider-profile/` (`api.ts`, `components/RiderProfileCard.tsx`) behind new
  route `app/rides/[id]/riders/[registrationId]/page.tsx`; `ride-detail/
components/RidersSection.tsx` now links each rider to that route.
- **packages/ui**: `terminology.ts` gained `GARAGE_TERMS` and
  `RIDER_PROFILE_TERMS` blocks, plus additive keys on `PROFILE_TERMS`/
  `BACK_LINK_TERMS`.

## Integration boundaries

- Maps: isolated behind `packages/maps-core`'s interface; `packages/maps-2gis` is the
  only package allowed to import the 2GIS SDK (ADR-010, `.claude/rules/maps.md`).
  Composition points: `apps/web/src/lib/maps/create-map-renderer.ts` (render) and
  `apps/api/src/plugins/maps.ts` (Geocoder/Routing, CR-114).
- Storage: S3-compatible adapter isolated behind storage interface.
- Notifications: provider-specific adapters isolated behind notification interface,
  delivered asynchronously via a queue (see `.claude/rules/resilience.md`) so delivery
  failures never block or roll back the action that triggered them.
- Auth: session/provider-specific implementation isolated behind auth boundary.

## Resilience posture

Modular monolith (ADR-008), not microservices. Module boundaries below are the seams that
would allow future extraction into a real service _if_ justified later — not a plan to do
so now. See `.claude/rules/resilience.md` for the actual failure-isolation mechanisms
(timeouts, retries, circuit breakers, async side effects, health checks).

## Core relations

User
→ OrganizerProfile
→ Bike (ADR-023; "garage" — a User's own bikes, not ride-scoped)
→ Ride

Ride
→ Route
→ RoutePoint
→ Stop
→ RideGroup (ADR-022; Registration/WaitlistEntry → RideGroup of the same Ride)
→ RideRequirement
→ RideService
→ Registration
→ WaitlistEntry
→ RideUpdate
→ Notification
→ Review
