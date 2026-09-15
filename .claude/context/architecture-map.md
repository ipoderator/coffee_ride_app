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
route is CR-011); `GET /health` is a bootstrap stub (`{ status: 'ok' }`, no
dependency checks — CR-051 replaces the handler body). Env validated at startup via
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
rather than adding a second, parallel `OrganizerCabinetShell`. New
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
- maps-2gis/ ← exists (CR-007; 2GIS adapter, only package allowed to speak to 2GIS)

## Web responsibilities

Next.js UI, route pages, forms, map UI, typed API client.

## API responsibilities

Fastify routes/controllers, validation, use cases/services, authorization, persistence orchestration.

## DB responsibilities

PostgreSQL schema, Drizzle client, migrations.

## Shared responsibilities

Types/contracts and reusable UI.

## Integration boundaries

- Maps: isolated behind `packages/maps-core`'s interface; `packages/maps-2gis` is the
  only package allowed to import the 2GIS SDK (ADR-010, `.claude/rules/maps.md`).
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
→ Ride

Ride
→ Route
→ RoutePoint
→ Stop
→ RideRequirement
→ RideService
→ Registration
→ WaitlistEntry
→ RideUpdate
→ Notification
→ Review
