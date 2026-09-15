# Project State

## Phase

MVP / Foundation

## Current task

None active. Pre-foundation hardening (CR-067..CR-072), CR-087 (repository-wide
Prettier formatting), CR-001 (monorepo tooling initialized), CR-002 (`apps/web`
scaffolded), CR-003 (`apps/api` scaffolded, includes CR-073), CR-004
(`packages/db` scaffolded), CR-005 (Redis client factory), CR-006 (S3
client factory), CR-007 (five shared packages: config, types, ui,
maps-core, maps-2gis), and CR-008 (Vitest wired for `apps/api`/
`packages/maps-2gis`/`apps/web`, Playwright wired for `apps/web` e2e) all
completed 2026-09-12. CR-009 (Configure Docker Compose) and CR-010 (Configure
CI + Git hooks, lint-staged made workspace-aware) both completed 2026-09-13.
Foundation phase (CR-001..CR-010) is now fully done. CR-063 (Design tokens),
CR-064 (Russian formatters + UI terminology mapping), CR-065 (Metric
presentation components), and CR-066 (Shared state primitives) also completed
2026-09-13 — Design-foundations phase (CR-063..CR-066) is now fully done.
CR-011 (User registration) and CR-012 (Login/logout/session) also completed
2026-09-13. CR-013 (Profile) completed 2026-09-14 — Auth phase (CR-011..CR-013)
is now fully done except CR-058 (Redis-backed rate limiting)/CR-060 (password
reset), still deliberately deferred; CR-059 (organizer-publish email-
verification gate) closed 2026-09-14 alongside CR-019 (see below). CR-014 (Organizer profile), CR-015 (Organizer dashboard), and CR-017 (Create
ride) also completed 2026-09-14. CR-088 (Organizer rides list — new ticket,
added this session per KI-024's own "next action"), CR-016 (Organizer
authorization), and CR-018 (Edit draft) also completed 2026-09-14, in that
order, in one session: CR-088 first (so CR-018's edit screen had a real UI
entry point), then CR-016/CR-018 together (the ownership check only has a
mutation to protect once CR-018's `PATCH` exists). CR-019 (Publish ride) also
completed 2026-09-14, together with CR-059's remaining scope (gating organizer
publish on `emailVerified`, `.claude/rules/security.md`). CR-089 (Open
registration — new ticket, added this session per KI-025's own "next action")
and CR-020 (Close registration) also completed 2026-09-14, together, in that
order (CR-020 had nothing to close without CR-089 existing first). CR-021
(Cancel ride) also completed 2026-09-15: `POST /v1/rides/:id/cancel`
(`published`/`registration_open`/`registration_closed → cancelled`, the only
transition with three valid source statuses). CR-090 (Start ride — new
ticket, added this session per KI-027's own "next action") and CR-022
(Finish ride) also completed 2026-09-15, together, in that order (CR-022 had
no reachable source state without CR-090 existing first). Rides section's organizer-facing lifecycle work is
now fully done: CR-017/CR-088/CR-016/CR-018/CR-019/CR-089/CR-020/CR-021/
CR-090/CR-022 — the full ride lifecycle (`draft` through
`cancelled`/`finished`) is implemented end to end. CR-023 (Ride detail,
participant-facing) also completed 2026-09-15: `GET /v1/rides/:id` extended
from owner-only to serve any viewer, and `apps/web`'s first fully public
screen, `/rides/[id]`. CR-024 (Ride list, public discovery) also completed
2026-09-15: `GET /v1/rides` (fully public, "published+" statuses), and
`apps/web`'s `/` (replaces the CR-002 bootstrap placeholder). CR-025
(Filters) also completed 2026-09-15: `?bicycleType=` on `GET /v1/rides`
plus the "upcoming only" default + `startsAt asc` sort (resolves KI-029).
CR-026 (Map discovery) and CR-084 (its geo-query prerequisite, decided
together — same precedent as ADR-013/CR-062) also completed 2026-09-15:
`rides` gained nullable `startLat`/`startLng` (ADR-014: plain columns + a
bbox range query, not PostGIS — no PostGIS in the current Postgres image,
no named radius-search use case), `GET /v1/rides` gained an optional
`?bboxNorth=&bboxSouth=&bboxEast=&bboxWest=` map-viewport filter,
`PATCH /v1/rides/:id` accepts the new coordinate fields (manual entry only —
KI-016 blocks a geocode-by-address UI), and `/` gained a List/Map toggle.
No live 2GIS credential exists in this environment, so the map view is a
real, live-verified degraded state (`ErrorState`, `.claude/rules/
resilience.md`) rather than an unverifiable live MapGL render (new KI-031).
The Rides section now has every ticket done through CR-026. CR-027 ("GPX
upload") and its prerequisite CR-085 (event-loop-safety decision) also
completed 2026-09-15, decided/built together (ADR-015, same precedent as
ADR-014/CR-026): a new `routes` table (one per ride, GPX-parsed geometry +
computed distance/elevation/point count), `POST`/`PATCH`/`DELETE
/v1/rides/:id/route` (draft-only, multipart) plus a new `GET /v1/rides/:id/
route/download` endpoint, and a new `/organizer/rides/[id]/route` screen.
No live MinIO in this environment (KI-015, widened) — the S3 code path is
real and unit-tested with the client mocked, live-verified only for its
degraded (`503 route_storage_unavailable`) response, not a successful
upload. CR-028 ("Route rendering") also completed 2026-09-15: `GET
/v1/rides/:id/route/geometry` (resolves KI-035, no S3 call — reads
`Route.geometry` straight from the DB) and a "Маршрут" section on
`/rides/[id]` — a hand-built inline-SVG elevation profile chart (real,
live-verified) plus a degraded route-map placeholder (KI-031 widened, same
missing 2GIS MapGL credential as CR-026's discovery map). `apps/web` gained
its first real dependency on `packages/maps-core` (type-only `LatLng`
import). The Route section has CR-029 ("Route metadata"), CR-030 ("Stops"),
and CR-031 ("Route points") remaining.

## Implemented

Harness, project specification, and pre-foundation decisions. Root monorepo tooling is
operational (CR-001). `apps/web` exists (CR-002): Next.js 15 + Tailwind v4 + shadcn/ui
foundation, builds/typechecks/lints clean, placeholder home page smoke-tested.
`apps/api` exists (CR-003): Fastify 5 + Zod (`@fastify/type-provider-zod`) + RFC 9457
errors + OpenAPI, boots and was smoke-tested (health/404/validation/production
placeholder-rejection all verified live, not just typechecked); it also has a Redis
client factory (CR-005, `src/redis.ts`, `ioredis`) and an S3 client factory
(CR-006, `src/s3.ts`, `@aws-sdk/client-s3`), neither yet consumed (ADR-004: only
when justified; first S3 consumer is CR-027/CR-086) and neither live-verified
this session (KI-014, KI-015 — Docker's daemon was unavailable throughout, see
`docker-desktop-unavailable` in Claude's project memory).
`packages/db` exists (CR-004): Drizzle + `drizzle-kit`, zero domain tables by
design, validated live against a real Postgres.

Five more `packages/*` exist now (CR-007, 2026-09-12, see `docs/changelog.md`):
`packages/config` (shared Node-library tsconfig fragment + ESLint factory,
closes KI-013/KI-R06 forward — not itself in `.claude/rules/architecture.md`'s
package list); `packages/types` (`ProblemDetails` + `Paginated<T>`, the two
ADR-011 contract shapes, already wired into `apps/api`'s error handler as a
real consumer — `import type`, fully erased, confirmed in compiled output);
`packages/ui` (intentionally empty at the time, `export {}` — first content
landed with CR-063/CR-064);
`packages/maps-core` (the full `MapProvider` interface from
`.claude/rules/maps.md`, verbatim, pure types); `packages/maps-2gis`
(implements `MapProvider` by calling 2GIS's Geocoder/Routing REST APIs
directly via `fetch`, no SDK dependency — timeouts applied, retries/circuit
breaker deferred to CR-049, not wired into any route yet). Two new gaps
recorded: KI-016 (2GIS response parsing unverified against a live account)
and KI-017 (`maps-2gis`/`db` export raw TS source, which only works because
neither has a real runtime consumer yet — must switch to compiled `dist`
exports before one does).

Test runners wired 2026-09-12 (CR-008, see `docs/changelog.md`): Vitest 5 for
`apps/api` (5 tests against `buildApp()` via Fastify's `.inject()` — health,
404 envelope, Zod validation → 400, unexpected error → 500 with no leaked
internals, a below-500 thrown error passed through with its own status),
`packages/maps-2gis` (11 unit tests against `create2GisMapProvider` with
`fetch` mocked — geocode/reverseGeocode/getRoute parsing, the waypoints-as-
geometry fallback, non-2xx/timeout/malformed-JSON all normalized into
`MapProviderError`), and `apps/web` (jsdom + React Testing Library, one smoke
test on the placeholder home page). Playwright wired for `apps/web` e2e (one
smoke spec, live-verified against a real `next dev` server: browsers
installed, `playwright test` run and passed). `packages/db`/`types`/`ui`/
`maps-core`/`config` intentionally got no test script (nothing real to test
yet — same "tooling first" discipline as CR-004..CR-007); `turbo test`
silently skips packages with no `test` script, by design, not by omission.
Not wired into CI (`.github/workflows/ci.yml`'s existing `Test` step now
actually runs the three Vitest suites; a Playwright CI job stays deferred to
CR-080 — KI-007 stays open). A real tsconfig bug was found and fixed along
the way: KI-018 (`packages/config`'s shared tsconfig fragment's chained
`extends` broke under Vite 8's oxc transform; fixed by having every consumer
extend both `tsconfig.base.json` and the fragment directly as a TS 5+ array,
resolved in the same session).

`docker-compose.yml` brought to a correct, verified-as-possible state 2026-09-13
(CR-009, see `docs/changelog.md`): fixed two real, previously-open bugs
(KI-004: MinIO's healthcheck used `curl`, which the server image doesn't ship
— replaced with `mc ready local`, MinIO's own documented healthcheck; KI-005:
`minio/minio:latest` was unpinned — pinned to `quay.io/minio/minio:
RELEASE.2025-09-07T16-13-09Z`, switching registries since MinIO's docs now
point at quay.io exclusively, both verified live against MinIO's official
example/registry API before use), added a missing Redis healthcheck, and
added `pnpm infra:up`/`infra:down` root scripts. Docker's daemon is still
unreachable in this environment (KI-019, same standing constraint as
KI-014/KI-015) — validated via `docker compose config` only, no live boot.
KI-003's Redis auth/persistence gap is unchanged, deliberately deferred to
CR-077.

Git hooks made workspace-aware 2026-09-13 (CR-010, see `docs/changelog.md`):
resolved KI-012 — root `package.json`'s `lint-staged` config now has one glob
entry per workspace member (`pnpm --filter <name> exec eslint --fix`) instead
of a single blanket root-CWD rule, so a staged file inside any of the 8
workspace members is actually ESLint-checked (not just Prettier-formatted) at
commit time, using that package's own `eslint.config.mjs`. Verified live with
a real unused-variable violation staged in `apps/web`: silently skipped under
the old config, correctly caught under the new one. `.github/workflows/ci.yml`
reviewed and left unchanged — its Foundation-phase shape was already sound;
KI-007's remaining gaps (MinIO/migrations/Playwright in CI) stay CR-080's job.
Foundation phase (CR-001..CR-010) is complete.

Design tokens landed 2026-09-13 (CR-063, see `docs/changelog.md`): the placeholder
shadcn neutral theme in `apps/web/src/app/globals.css` is replaced by the real
light/dark palette from `docs/design.md` §3, sourced from a new
`packages/ui/src/tokens.css` (`:root`/`.dark` CSS custom properties mapped into
Tailwind v4's `@theme inline`) and consumed via `apps/web`'s first-ever workspace
dependency on `ui`. Golos Text (UI text) and IBM Plex Mono (tabular/data text) wired
via `next/font/google` in `layout.tsx`; Cyrillic rendering verified live (not just via
metadata) with a temporary dev server + the browser-automation skill, in both themes.
Tailwind v4's default font-size and spacing scales already match `docs/design.md` §4/§5
exactly, so no parallel tokens were added for either — only radius (8px default, via
`--radius: 0.5rem`) and one `--shadow-overlay` elevation token were. Added the §14 lint
rule rejecting raw hex color literals in `apps/web` (`no-restricted-syntax` in
`apps/web/eslint.config.mjs`), verified live with a staged violation. New open item:
KI-020 (`apps/web/components.json`'s shadcn alias defaults into `apps/web`, not
`packages/ui`, as `docs/design.md` §9/§14 requires — must be resolved by CR-065/CR-066
before vendoring the first component). No shared components exist yet — that
starts with CR-065/CR-066.

Russian formatters + UI terminology mapping landed 2026-09-13 (CR-064, see
`docs/changelog.md`): `packages/ui/src/format.ts` (every row of `docs/design.md` §7 —
distance, elevation, speed/pace, duration, date, time, price, participants; comma
decimal separator, NBSP thousands grouping and NBSP value-unit join throughout; a
missing/`null`/`undefined` numeric input renders as an em dash rather than `0`, per
`.claude/rules/frontend.md`/§6) and `packages/ui/src/terminology.ts` (§13 — ride status
with tone, bicycle type, services, registration action/state labels). Ride status and
bicycle type enum keys are copied verbatim from `docs/product.md`'s already-fixed
lifecycle/bicycle-type strings; services and registration labels have no authoritative
enum yet (`packages/db` has zero domain tables), so their keys are provisional —
recorded as KI-021. `packages/ui`'s first real Vitest suite (31 tests, `node`
environment, same `config/vitest/node-library` fragment as `packages/maps-2gis`).
`packages/ui/src/index.ts` now has its first real exports (was `export {}` since
CR-007). Deliberately deferred: the ride-start timezone-hint decoration mentioned in §7
(needs a viewer-timezone source and a place name that don't exist as data yet) — basic
24-hour time formatting against an explicit IANA zone (§7's Time row itself) is
implemented.

Metric presentation components landed 2026-09-13 (CR-065, see `docs/changelog.md`):
`packages/ui/src/components/{MetricTile,MetricRow,StatusBadge,DifficultyScale}.tsx` —
`docs/design.md` §6, on top of CR-063's tokens and CR-064's formatters/terminology.
`format.ts` gained additive `*Parts` helpers (value/unit split, for `MetricTile`'s
differently-styled unit) without changing its existing joined-string contract.
`terminology.ts` gained the five difficulty words. `StatusBadge` renders `danger` as
the only solid-fill tone, every other tone (including a new `neutral` case) as a
tinted/outlined chip — per §1's "one exception," inferred from `tokens.css` only
defining `--on-danger`/`--on-primary` foregrounds. `packages/ui` has its first
jsdom + Testing Library Vitest setup (54 tests) and a shared `cn` helper (its own
copy — `packages/ui` cannot depend on `apps/web`). A live visual check (temporary
render in `apps/web`, reverted after) caught a real bug: Tailwind v4 never scanned
`packages/ui` for utility classes at all (every class present in the DOM, zero CSS
generated) — fixed permanently with an `@source` directive in `apps/web/src/app/
globals.css` (KI-R10, resolved same-session). KI-020 (shadcn CLI's vendoring target)
confirmed NOT triggered by this task — `StatusBadge` was built self-contained,
deliberately not composed from a separate generic `Badge`, to avoid pulling that
still-open question in early. No cabinet screens exist yet — these four components'
first real consumer is CR-011.

Shared state primitives landed 2026-09-13 (CR-066, see `docs/changelog.md`):
`packages/ui/src/components/{Skeleton,EmptyState,ErrorState}.tsx` — `docs/design.md`
§10's remaining three of the five required per-screen states (loading/empty/error/
degraded/success), completing the Design-foundations phase. `Skeleton` is a decorative
shimmer block, animation gated behind `motion-safe:` for `prefers-reduced-motion`
(§12); it's a real shadcn-registry primitive (unlike CR-065's four), hand-vendored
directly against our own tokens rather than via the shadcn CLI — a scoped, not
general, resolution of KI-020 (updated, still open for a structurally complex future
primitive). `EmptyState` requires a caller-supplied `title` (§10: never a bare "Нет
данных") plus optional `description`/`action`/`icon`. `ErrorState` covers both the
Error and Degraded states (§10 points 3-4, the latter being CR-052/
`.claude/rules/resilience.md`'s pattern) from one component via `tone`/`variant`
instead of a second component: `tone="danger"`+`variant="block"` (default,
`role="alert"`) for an outright failure, `tone="warning"`+`variant="inline"`
(`role="status"`) for a non-interrupting degraded notice next to still-usable content.
`terminology.ts` gained `UI_TERMS.retry` ("Повторить") so the retry button's default
label isn't a literal inside the component (`.claude/rules/frontend.md`). A live
visual check (temporary showcase in `apps/web`, reverted after) caught a real bug:
`ErrorState` needed `'use client'` — its own `onClick` handler can't be wired by a
Server Component passing `onRetry` through it, confirmed by the Next.js App Router
build actually failing until added. Confirmed live in both themes: pulse animation
present normally, `animation-name: none` under emulated
`prefers-reduced-motion: reduce`; 0 console errors/failed requests.
Design-foundations phase (CR-063..CR-066) is now complete — CR-011 is next.

User registration landed 2026-09-13 (CR-011, see `docs/changelog.md`): first real
screen, first `packages/db` domain tables (`users`, `email_verification_tokens`,
migrated and live-verified against a local scratch Postgres — Docker still
unreachable, KI-019), first `apps/api` capability module (`src/modules/auth/`:
Argon2id hashing via `argon2`, crypto-random verification tokens hashed with
SHA-256, transactional register/verify-email service, `FastifyPluginAsyncZod`
routes), and first consumer of every `packages/ui`/`packages/types` piece
CR-063..CR-066 built. `POST /v1/auth/register` and `POST /v1/auth/verify-email`
live under `/v1`, both behind a 5/min/IP `@fastify/rate-limit` tier (in-memory
store — KI-014, Redis unverified). `packages/types` gained its first domain type
(`User`) and first real runtime dependency (`zod`, for the shared
register/verify-email contract both `apps/api` and `apps/web` validate against).
`packages/ui` gained its first form primitives (`Button`/`Input`/`FormField`/
`Card`, hand-vendored like `Skeleton` — KI-020 updated). `apps/web` gained its
first real screen (`/register`, `src/features/auth/register/`) and its first
`next.config.ts` customization (`rewrites()` for the single-origin `/api/v1/*`
proxy, ADR-013; a webpack `resolve.extensionAlias` so it can bundle
`packages/types`' NodeNext-style `.js`-suffixed imports). 30 new tests across
`apps/api`/`packages/ui`/`apps/web` (116 total in those three packages), all
green; found and fixed a real gap along the way — `apps/web/vitest.setup.ts`
never registered React Testing Library's cleanup, so multi-test component files
leaked renders between tests. Live-verified end to end this session: register →
duplicate-email (409) → verify-email (200 → already-used 400 / unknown 400) over
real HTTP with curl; `/register` exercised in a real browser in both themes (dark
via the `.dark` class — this app's dark mode is class-based, not
`prefers-color-scheme`) with 0 console errors. `npx turbo run lint/typecheck/
build/test` (run separately — see known limitations) and `format:check`/
`lint:root` all green. Also confirmed, live, a real production-blocking bug
predicted but never exercised since CR-007: `NODE_ENV=production node
dist/server.js` crashes immediately because `packages/db` (and almost certainly
`packages/types`) export raw TS source that plain `node` can't resolve the way
`tsx`/`tsc` do (KI-017, now confirmed rather than hypothetical — resolving it
is an architecture/tooling decision deferred pending an ADR, not fixed inside
this ticket). Added a CI migration step (`.github/workflows/ci.yml`) so the new
auth tests have real tables to run against in CI's fresh `postgres` service.

Login/logout/session landed 2026-09-13 (CR-012, see `docs/changelog.md`):
`POST /v1/auth/login`, `POST /v1/auth/logout`, `GET /v1/auth/me` on top of
CR-011's `users` table. `packages/db` gained its second domain table,
`sessions` (ADR-013's exact column list — `tokenHash`, `userId`, `createdAt`,
`expiresAt`, `lastUsedAt`, `revokedAt`), migrated and live-verified against
the same local scratch Postgres (Docker still unreachable, KI-019). Sessions
are database-backed per ADR-013: opaque cookie token, only its SHA-256 hash
persisted, 30-day rolling expiry extended at most once/day (unit-tested with
an injected fake `now`, not a real wait). Login returns the identical
`invalid_credentials` 401 for an unknown email and a wrong password — no
account enumeration — including a dummy Argon2id verify on the unknown-email
path. `apps/api` gained two new cross-cutting plugins: `plugins/auth.ts`
(`requireAuth` preHandler, opt-in per route) and `plugins/csrf.ts` — ADR-013's
CSRF mechanism's first real implementation, an `Origin`/`Referer` preHandler
on every unsafe `/v1` method (register/verify-email now behind it too),
allowing the request through when neither header is present. New required
env var `WEB_ORIGIN`. `@fastify/cookie` added (no signing secret — the cookie
carries only an opaque token, checked only against its DB-stored hash). 17
new `apps/api` tests (32 total, up from 15), all green and stable across
repeated runs — a real deadlock bug was found and fixed along the way (two
Vitest test files running `TRUNCATE ... CASCADE` concurrently against
overlapping tables took conflicting Postgres `ACCESS EXCLUSIVE` locks; fixed
by switching every such `beforeEach` to `DELETE FROM users`, relying on the
existing `ON DELETE CASCADE` foreign keys — row-level locks only, no more
deadlock, verified stable across 3 repeated full-suite runs). `npx turbo run
lint/typecheck/build/test` (run separately) and `format:check`/`lint:root`
all green. Live-verified end to end against a real local Postgres + a real
running `apps/api`: register → login (200 + cookie) → `GET /me` (200) →
logout (204, cookie cleared, row hard-deleted — verified via a direct DB
query) → `GET /me` with the same cookie (401) → login with a mismatched
`Origin` (403 `csrf_origin_mismatch`), all via curl. KI-022's CSRF gap is now
closed; its rate-limiting (CR-058) and `@fastify/helmet` (CR-061,
now headers-only) gaps remain open.

Profile landed 2026-09-14 (CR-013, see `docs/changelog.md`): a logged-in user can
view/edit their own profile at `/me/profile`. `users` gained three nullable
columns (`displayName`/`phone`/`bio` — no product doc had specified profile
fields yet, scoped minimally this session; avatar/photo upload explicitly
deferred, needs the S3 pipeline, KI-015/CR-086). New `apps/api` capability
module `modules/users/` (`PATCH /v1/users/me`, `.claude/rules/architecture.md`
treats `users` as distinct from `auth`) — no separate `GET /v1/users/me`,
`GET /v1/auth/me` already returns the full profile once `toPublicUser` includes
the new fields (no duplicate concepts). Closed two prerequisite gaps rather than
working around them: CR-012 had shipped login API-only, so added the `/login`
screen; and built the first real ADR-009 cabinet nav registry (participant side
only — a feature pushes a `CabinetNavItem` descriptor, `CabinetShell` renders
the list and gates access on a valid session, redirecting to `/login` on 401)
rather than hard-coding a single-feature shell, since none existed yet
(CR-054 still generalizes this to widgets/organizer-side/flags). New shared
`packages/ui` primitive: `Textarea` (bio's multi-line control). Found and fixed
two real bugs along the way, not test-only workarounds: `apps/api/src/plugins/
db.ts` never closed its postgres.js connection pool on `app.close()` (a genuine
resource leak, fixed with an `onClose` hook); and `apps/api`'s Vitest suite
needed `fileParallelism: false` once a fourth DB-touching test file made
concurrent files' `beforeEach: DELETE FROM users` collide with each other's
in-flight requests (same class of issue as CR-012's TRUNCATE-deadlock fix, now
closed at file-scheduling level). 44 `apps/api` tests (was 38), 22 new `apps/web`
tests (was 8, now 30), all green and stable across 5 repeated full-suite runs.
Live-verified end to end: curl sequence against a real Postgres + running
`apps/api`, and a full browser flow (login → cabinet → profile → edit → reload
persists) against a real `next dev` server via the `browser-automation` skill —
zero console errors beyond the expected pre-login 401.

Organizer profile landed 2026-09-14 (CR-014, see `docs/changelog.md`): a logged-in
user can create and edit their own `OrganizerProfile` — the second fixed domain
entity, second user-owned resource after `User` itself. `packages/db` gained its
third table, `organizer_profiles` (`userId` FK → `users`, cascade delete, unique —
at most one per `User`, ADR-006; `name` not null 1-100 chars, `description`
nullable ≤500 chars), migrated and live-verified against the same local scratch
Postgres. `apps/api` gained its third capability module, `modules/organizers/`
(`POST`/`GET`/`PATCH /v1/organizers/me`, all `requireAuth`) — `POST` is gated on
`users.emailVerified` (`.claude/rules/security.md`: "Require a verified email
before an account can act as an organizer"), 403s `email_verification_required`
otherwise, 409s `organizer_profile_already_exists` on a second create. `apps/web`
gained `/organizer/profile` (one form covering both create and edit state,
`features/organizer/profile/`) and `/organizer` (minimal stub, same reasoning as
CR-013's `/me` stub — full dashboard is CR-015). `CabinetShell` (CR-013) was
generalized to take a `navItems` prop instead of being hard-coded to the
participant registry — `docs/design.md` §8 already says both cabinets share one
shell, so this closes that gap rather than duplicating the shell per cabinet; new
`apps/web/src/lib/cabinet/organizer-nav.ts` registry (ADR-009). `/me` gained a
small additive CTA card linking into `/organizer/profile` — otherwise nothing
links a participant into the organizer cabinet until CR-015's dashboard exists.
A real bug was found and fixed by this ticket's own Vitest suite (not by a
browser check): `OrganizerProfileForm`'s success-message text was originally
derived from the `profile` state variable at render time, but `setProfile` (run
right after a successful create) already flips it to non-null before that render,
so a fresh create showed the edit-mode success copy — fixed by capturing
`wasCreate` before the request and setting an explicit success-message string
from that, not by re-deriving text from `profile` after the update. 12 new
`apps/api` tests (50 total, was 38 — this file's prior "44" for CR-013 was
itself stale; 38 is the confirmed pre-CR-014 count), 9 new `apps/web` tests (31
total, was 22). Live-verified end to end: curl sequence against a real Postgres +
running `apps/api` (unauth 401 → unverified-email 403 → verify → create 201 →
duplicate 409 → invalid 400 → GET 200 → PATCH rename/clear 200 → mismatched-
Origin 403, each cross-checked against a direct DB read); full browser flow via
`browser-automation` against a real `next dev` server (unauthenticated redirect
to `/login`, CTA on `/me`, `/organizer/profile` loading in edit mode pre-filled
with the existing profile, edit → save → success message → reload → persisted) —
no console errors beyond the expected pre-login 401. New known limitation: no
public organizer-read endpoint yet (nothing needs it until `Ride` exists, CR-017+)
and organizer capability itself has no authorization check to protect anything
with yet — CR-016 ("Organizer authorization") is explicitly about exercising it
once something organizer-owned exists in the schema.

Organizer dashboard landed 2026-09-14 (CR-015, see `docs/changelog.md`):
`/organizer` renders a real widget grid instead of CR-014's stub `EmptyState`.
User asked to combine this with CR-016 in one pass; checked the repo and two
sibling Claude sessions on this machine first — no prior plan for that
combination existed anywhere, and CR-014's own entry above already documents
CR-016 as blocked on `Ride`/CR-017+ (nothing organizer-owned to check
ownership against yet). Per the user's instruction to follow the plan as
originally documented, did CR-015 alone; CR-016 is untouched. New
`DashboardWidget` descriptor (`apps/web/src/lib/cabinet/types.ts`, same shape
as `CabinetNavItem`) and a small organizer-only `ORGANIZER_WIDGETS` registry
(`lib/cabinet/organizer-widgets.ts`) — no feature flags; `docs/tasks.md`'s
CR-054 is the ticket that generalizes nav/widgets with flags across both
cabinets, not this one. One widget registers: `OrganizerProfileWidget`
(`features/organizer/profile/components/`, alongside the existing nav-item
descriptor in that feature's `nav.ts`) — a read-only summary of the same
`OrganizerProfile` CR-014 built, reusing `getOrganizerProfile()` as-is, no new
API endpoint. No ride widget — `Ride` doesn't exist until CR-017+. 4 new
`apps/web` tests (35 total, was 31); `apps/api`/`packages/ui` test counts
unchanged (no files touched in either). Live-verified via the
`browser-automation` skill against a real `next dev` server + `apps/api`:
fresh verified account → `/organizer` showed the "not created yet" empty
state with a working create link → created a profile through the existing
`/organizer/profile` form → `/organizer` showed the populated summary widget
with a working edit link — no console errors beyond the widget's own expected
404 fetch (the not-found case itself) and ordinary dev-server noise.

Create ride landed 2026-09-14 (CR-017, see `docs/changelog.md`): the first
`Ride` table (`packages/db`, fourth table — owned by `OrganizerProfile`,
`organizer_id` FK `ON DELETE RESTRICT`, two new pg enums, 7 CHECK
constraints) and `POST /v1/rides` (`apps/api/src/modules/rides`, fourth
capability module — requires the caller to already have an `OrganizerProfile`,
403 `organizer_profile_required` otherwise). Scoped to a _minimal valid
draft_: only `title`/`bicycleType`/`startsAt`/`startTimezone` are required —
every other column (`description`, capacity, price, distance/duration/pace/
elevation, difficulty, cover image) stays `null`, filled in by CR-018 ("Edit
draft") — not this ticket, same "build the minimal real thing now" discipline
prior CRs used. Route/stops/services/requirements are not this table at all;
`RideRequirement`/`RideService` still have no CR number (KI-021's sibling
gap). User asked to "continue per the original plan"; per CR-015's own
follow-up, that meant CR-017 (CR-016 stays blocked until this ticket's
`Ride` table exists — genuinely startable now, but deliberately not started
this session, since CR-016 is about an ownership check on a _mutation_ of an
existing ride, which only starts existing with CR-018).

Architecture fix discovered and fixed in this ticket (not a new ADR):
`RideStatus`/`BicycleType`/`DifficultyLevel` (CR-064) lived in
`packages/ui/src/terminology.ts`, but `apps/api` needed the same enums for
Zod validation and `packages/db` the same value lists for its Postgres
enums — `apps/api` must never depend on `packages/ui`
(`.claude/rules/architecture.md`). Moved to `packages/types/src/domain/
ride.ts`; `packages/ui` now depends on `types` (previously had none) and
re-exports the types unchanged from `terminology.ts`, keeping only the
Russian label maps there.

Timezone handling: ADR-012 needs the instant plus the ride's IANA start
zone. Server validation is loose (any zone `Intl` recognizes); the web picker
is narrower — `RUSSIAN_TIMEZONE_OPTIONS` (`packages/ui`), the 11 real Russian
IANA zones, matching ADR-012's own "Russia spans eleven offsets" framing. New
utility `apps/web/src/lib/datetime/zoned-time.ts` (`zonedTimeToUtcIso`)
converts a local wall-clock time + IANA zone into the correct UTC instant —
no timezone library dependency anywhere in this repo; unit-tested against 4
Russian zones (all DST-free year-round, Russia abolished DST in 2014).

`apps/web` gained `/organizer/rides/new` (`features/organizer/rides/`,
`CreateRideForm` — self-contained create-only, no edit-screen dependency
since none exists yet) and a stopgap nav entry (`organizerRidesNavItem`,
"Заезды") — no ticket yet builds the real `/organizer/rides` "My rides" list
`docs/design.md` §8 describes, flagged as new known issue KI-024 rather than
silently worked around; CR-018 will hit the same gap unless a CR number is
added first. 8 new `apps/api` tests (58 total, was 50); 9 new `apps/web`
tests (44 total, was 35 — 5 for `CreateRideForm`, 4 for `zonedTimeToUtcIso`).
Live-verified via curl (401/403/201/400×3/CSRF-403, 201 cross-checked against
a direct DB read) and the `browser-automation` skill against a real `next
dev` server + `apps/api`: filled Красноярск (UTC+7) + 18:30 local, submitted,
success view showed the correct local time back ("15 июня 2027 18:30", not
UTC-shifted) — independently confirmed via a direct DB read
(`14:30:00+03` = `11:30 UTC`, exactly 18:30 Krasnoyarsk). No console errors
beyond the expected pre-login 401.

Organizer rides list, authorization & edit draft landed 2026-09-14
(CR-088/CR-016/CR-018, see `docs/changelog.md`): three tickets, one session.
KI-024 (opened by the CR-017 session) blocked starting CR-018 directly — no
ticket built `/organizer/rides`, so CR-018's edit screen would have had no UI
entry point. Added CR-088 to `docs/tasks.md` (first free number,
CR-001..CR-087 had no gaps) and built it first: `GET /v1/rides/mine`
(`apps/api/src/modules/rides`), the API's first cursor-paginated collection
endpoint (ADR-011 §2) — new shared `apps/api/src/lib/cursor.ts` for every
future collection endpoint to reuse; `/organizer/rides`
(`features/organizer/rides/components/RidesList.tsx`) groups the caller's
own rides by status. `organizerRidesNavItem` now points here instead of
straight at `/organizer/rides/new`. Then CR-016 ("Organizer authorization")
together with CR-018 ("Edit draft") — CR-016 has no surface of its own; it
_is_ the ownership check inside `GET`/`PATCH /v1/rides/:id`
(`getRideForOwner`/`updateRideDraft`), both 404 `ride_not_found` whether the
ride doesn't exist or belongs to a different organizer (deliberately the
same response either way — resource-enumeration reasoning,
`.claude/rules/security.md`). `PATCH` is draft-only, 409 `ride_not_editable`
otherwise; fills in every field CR-017 left `null`
(`title`/`description`/`bicycleType`/`startsAt`+`startTimezone`/
`participantLimit`/`priceRub`/`distanceKm`/`elevationGainMeters`/`paceKmh`/
`durationMinutes`/`difficulty` — `coverImageUrl` stays out, KI-023). No
migration — CR-017's table already had every column. New `/organizer/rides/
[id]/edit` (`EditRideForm`) and the inverse timezone conversion,
`utcIsoToZonedLocalInput` (`zoned-time.ts`), to prefill it.
`CreateRideForm`'s success view now links into both new screens instead of
only "back to dashboard". Two real bugs found and fixed while building this
(not left as workarounds): interpolating a JS `Date` into a hand-written
Drizzle `sql` template throws inside the `postgres` driver's own parameter
binding (fixed — pass the cursor's `createdAt` as the ISO string it already
is, `::timestamptz` cast on the SQL side); and this file's own new tests'
last-run case left a `rides` row alive after the file finished (a
CSRF-rejected `PATCH` test creates a real ride via a preceding successful
`POST` first), breaking the next test file's cleanup with a foreign-key
violation — fixed with an `afterAll` in `rides.routes.test.ts`. 15 new
`apps/api` tests (73 total, was 58); 13 new `apps/web` tests (56 total, was
44). Live-verified end to end: curl sequence against a real Postgres +
running `apps/api` (mine-list pagination followed across a real second page,
malformed cursor 400, stranger's-ride 404, non-draft 409, valid `PATCH` 200
cross-checked against a direct DB read) and a full browser walkthrough via
`browser-automation` against a real `next dev` server (nav → list → edit →
save → reload, including the not-found state for a random id) — no console
errors beyond the expected pre-login 401 and the not-found check's expected 404. KI-024 is resolved (`.claude/context/known-issues.md`).

Publish ride landed 2026-09-14 (CR-019, together with CR-059's remaining
scope, see `docs/changelog.md`): `POST /v1/rides/:id/publish`
(`apps/api/src/modules/rides`), `draft -> published` only — the lifecycle's
later states have no owning ticket yet (new KI-025). Same ownership rules as
`GET`/`PATCH /v1/rides/:id` (404 `ride_not_found` either way), plus a new
caller-level gate this ticket adds: `.claude/rules/security.md` explicitly
names "publish a ride" as requiring `emailVerified` — 403
`email_verification_required` (fresh DB read, same code `POST
/v1/organizers/me` already uses), closing CR-059's one remaining piece.
Non-draft ride → 409 `ride_not_publishable` (a new code, distinct from
`PATCH`'s `ride_not_editable`). `apps/web`'s `/organizer/rides/[id]/edit`
gained a "Опубликовать" button next to Save (draft-only, same duplicate-
submit-protection discipline) and the same guiding email-verification banner
pattern `OrganizerProfileForm` already established. Surfaced (not silently
worked around) a real, growing gap while writing this: no `/verify-email` web
screen exists at all, so an organizer who hits either gate has no in-app way
to actually verify — new KI-026. 7 new `apps/api` tests (80 total, was 73); 3
new `apps/web` tests (59 total, was 56). Live-verified via curl (401/404
non-existent/404 stranger's-ride/403 unverified-email/409 non-draft/200
cross-checked against a direct DB read/403 CSRF) and the `browser-automation`
skill against a real `next dev` server + `apps/api`.

Open/close registration landed 2026-09-14 (CR-089/CR-020, see
`docs/changelog.md`): resolved KI-025 (opened by the CR-019 session — no
ticket transitioned a ride into `registration_open` at all) by adding CR-089
("Open registration") to `docs/tasks.md` — same "real gap, add a ticket"
precedent as CR-088/KI-024 — and building it together with CR-020 ("Close
registration") in one pass, since CR-020 had no reachable source state
without it. `POST /v1/rides/:id/open-registration` (`published ->
registration_open`) and `POST /v1/rides/:id/close-registration`
(`registration_open -> registration_closed`), both in `apps/api/src/modules/
rides`. Same ownership rules as `publish` (404 `ride_not_found` either way);
unlike `publish`, neither gates on `emailVerified` —
`.claude/rules/security.md` names only the publish trigger, and there is no
de-verification flow that could affect an already-published ride's
organizer. Two new 409 codes, one per action:
`ride_registration_not_openable`/`ride_registration_not_closable`. No
`packages/db` migration — both enum values already existed since CR-017.
`apps/web`'s `/organizer/rides/[id]/edit` gained two status-conditional
buttons ("Открыть регистрацию" while `published`, "Закрыть регистрацию" while
`registration_open`), same pattern CR-019 established for "Опубликовать". 12
new `apps/api` tests (92 total, was 80); 4 new `apps/web` tests (63 total,
was 59). Live-verified via curl (401/404 non-existent/404 stranger's-ride/409
wrong-state/200 cross-checked against a direct DB read/403 CSRF, for both
endpoints) and the `browser-automation` skill against a real `next dev`
server + `apps/api` (published -> open -> closed, screenshot-confirmed final
read-only state, 0 console errors during the flow itself).

Cancel ride landed 2026-09-15 (CR-021, see `docs/changelog.md`): `POST /v1/
rides/:id/cancel` (`apps/api/src/modules/rides`) — the only lifecycle
transition with three valid source statuses at once (`docs/product.md`'s
Lifecycle: `published/registration_open/registration_closed -> cancelled`).
One new 409 code, `ride_not_cancellable`, covers every other status
(`draft`/`started`/`finished`/already-`cancelled`). Same ownership rules as
every prior transition (404 `ride_not_found` either way), no `emailVerified`
gate (same reasoning as `open-registration`/`close-registration`). No
`packages/db` migration — `cancelled` already existed in the `ride_status` pg
enum since CR-017. New `packages/ui` `Button` `danger` variant (additive —
`variant` still defaults to `primary`) — `docs/design.md`'s one bright-red
exception to the calm palette. `/organizer/rides/[id]/edit` gained a red
"Отменить заезд" button (rendered for the three cancellable statuses),
guarded by a native `window.confirm()` — a deliberate, documented departure
from CR-019/CR-020's "no confirmation, no Dialog component yet" precedent:
cancellation is the one lifecycle step with no forward continuation, and
`docs/design.md` explicitly singles it out as needing to stay impossible to
miss, so a plain `confirm()` (no new component/dependency) is a proportionate
safeguard against a one-click irreversible action. 8 new `apps/api` tests
(100 total, was 92); 6 new `apps/web` tests (69 total, was 63). Live-verified
via curl (401/404 non-existent/404 stranger's-ride/409 `ride_not_cancellable`
from `draft`/200 from each of the three valid source statuses, all
cross-checked against a direct DB read/403 CSRF) and the `browser-automation`
skill against a real `next dev` server + `apps/api` (login -> organizer
profile -> create ride -> publish -> click "Отменить заезд" -> native
`confirm()` dialog intercepted and accepted -> success message + "Отменён"
badge, form fully disabled) — no console errors beyond the expected benign
`organizers/me` 404 (no profile yet, same pattern documented since CR-015).

Start + Finish ride landed 2026-09-15 (CR-090/CR-022, see
`docs/changelog.md`): resolved KI-027 (opened this session — no ticket
transitioned a ride into `started` at all, same shape of gap as
KI-024/KI-025) by adding CR-090 ("Start ride") to `docs/tasks.md`'s Rides
section and building it together with CR-022 ("Finish ride"), since CR-022
had no reachable source state without it. `POST /v1/rides/:id/start`
(`registration_closed -> started`) and `POST /v1/rides/:id/finish` (`started
-> finished`, the lifecycle's terminal non-cancelled state), both in
`apps/api/src/modules/rides`. Same ownership rules as every prior transition
(404 `ride_not_found` either way); neither gates on `emailVerified`. Two new
409 codes, one per action: `ride_not_startable`/`ride_not_finishable`. No
`packages/db` migration — both enum values already existed since CR-017.
Checked before adding CR-090 whether `started` might instead be an
automatic/time-based transition (would have let `finish` source from
`registration_closed` directly) — no scheduled-job/cron infrastructure or
ticket exists anywhere in the repo, and `docs/product.md`'s organizer-
capabilities list omitting "start" doesn't prove it's non-manual (it omits
"open/close registration" too, and those are real manual tickets); concluded
the same "add the missing preceding ticket" fix as KI-024/KI-025.
`/organizer/rides/[id]/edit` gained "Начать заезд"/"Завершить заезд"
buttons, no confirmation guard (unlike `cancel` — both are forward-only
steps). Reconfirmed by a new test that a `started` ride still correctly
rejects `POST .../cancel` with `409 ride_not_cancellable` (CR-021's own
`CANCELLABLE_STATUSES` was already correct; `started` just wasn't reachable
to exercise the path until now). 13 new `apps/api` tests (113 total, was
100); 5 new `apps/web` tests (74 total, was 69). Live-verified via curl
against a real Postgres + `apps/api` (register → verify → login → create
organizer profile → ride driven through publish/open-registration/close-
registration → `start`: 401/404/200/409 already-started → `cancel` on the
now-`started` ride: 409 `ride_not_cancellable` → `finish`: 200/409 already-
finished → a second organizer's 404 on both endpoints → 403 CSRF on both,
all cross-checked against direct DB reads) and a full browser walkthrough
via the `browser-automation` skill against a real `next dev` server +
`apps/api` (login → edit screen on a `registration_closed` ride → "Начать
заезд" → 200, success message, button flipped to "Завершить заезд" →
clicked it → 200, success message "Заезд завершён.", "Завершён" badge, no
action button remaining) — 0 console errors during the flow itself. The ride
lifecycle (`draft` through `cancelled`/`finished`) is now fully implemented
end to end.

Ride detail landed 2026-09-15 (CR-023, see `docs/changelog.md`): `GET /v1/
rides/:id` (`apps/api/src/modules/rides`), owner-only since CR-016/CR-018,
extended to serve any viewer — the ride's own organizer sees it at any
status, anyone else (including no session at all) sees it once it's left
`draft` (`404 ride_not_found` either way, same resource-enumeration
reasoning `RIDE_NOT_FOUND` already used). New `resolveOptionalUser`
preHandler (`apps/api/src/plugins/auth.ts`) resolves the session if present
without ever rejecting — distinct from `requireAuth`, still used by every
other `/v1` route. `getRideForOwner` was replaced by `getRideForViewer`,
which joins `organizer_profiles` and returns the ride's public `{ id,
name }` on the response (`organizer`, additive alongside the unchanged
`ride` field, `packages/types`' new `RideOrganizerSummary`/
`GetRideResponse`) instead of a separate public organizer-read endpoint
(`docs/product.md` Principle 2: "complete ride record, not a link out").
No `packages/db` schema change. `apps/web` gained its first fully public
feature module, `features/participant/ride-detail/` (`api.ts`,
`components/RideDetailView.tsx`), and its first top-level route with no
`CabinetShell`/auth gate at all, `/rides/[id]` — renders cover (if set)/
title/`StatusBadge`/organizer name/description/start date-time (in the
ride's own zone, `formatDate`/`formatTime`)/`MetricTile`s for whichever of
distance/elevation/pace/duration/difficulty are actually set/price/
participant limit, omitting (not em-dashing) any field still `null` —
deliberately different from `EditRideForm`'s form, which always shows every
field. `packages/ui/src/terminology.ts` gained `RIDE_DETAIL_TERMS`. Route/
stops/services/requirements/registration action have no data model yet
(CR-027..036) and no discovery screen links into `/rides/[id]` yet
(CR-024) — recorded as new KI-028, the same "screen built before its real
entry point" shape KI-024 already was for CR-017's create screen. 3 new/
replaced `apps/api` tests in the `GET /v1/rides/:id` block (116 total, was
113); 4 new `apps/web` tests (78 total, was 74). Live-verified via curl
against a real Postgres + running `apps/api` (draft ride: 404 with no
cookie/200 with the owner's cookie; non-existent id: 404; malformed id: 400;
published ride: 200 with no cookie at all, `organizer` cross-checked against
a direct DB read) and a full browser walkthrough via the
`browser-automation` skill against a real `next dev` server + `apps/api`
(unauthenticated: a published ride renders every field correctly formatted
— 0 console errors, 0 failed requests; a non-existent id renders the
not-found state, not a crash, with only the expected 404 fetch itself in
the console).

Ride list (public discovery) landed 2026-09-15 (CR-024, see
`docs/changelog.md`): `GET /v1/rides` (`apps/api/src/modules/rides`), the
collection root under the existing `ridesRoutes` prefix — fully public, no
`preHandler` at all (`docs/api.md` already committed to "no auth" before
this session). Same "published+" rule CR-023 established for the
single-ride endpoint: every status except `draft`. New `listPublicRides`
reuses CR-088's `(createdAt desc, id desc)` cursor key unchanged and joins
`organizer_profiles` like `getRideForViewer` so each item carries
`organizer: { id, name }` (`docs/product.md` Principle 2, same reasoning as
CR-023). `packages/types` gained `PublicRide`/`ListPublicRidesResponse`.
`apps/web` gained its second fully public feature module,
`features/participant/discovery/` — `RideCard` is deliberately
feature-local (`docs/design.md` §9), not `packages/ui`; shows title/status/
organizer/the canonical "first three" metrics (distance/elevation/pace,
never duration)/price, links to `/rides/[id]` (CR-023). `apps/web/src/app/
page.tsx` replaces the CR-002 bootstrap placeholder with `<DiscoveryList
/>` — `docs/design.md`'s `/` Discovery screen (list-only slice; map toggle
is CR-026, filters are CR-025). No "load more" control yet, same precedent
CR-088's `/mine` list already established. KI-028 narrowed (the "no
discovery entry point" half is resolved; route/stops/services/
requirements/registration on the detail screen stays open). New KI-029:
the list sorts `createdAt desc` (identical to `/mine`), not by
upcoming-soonest — `startsAt`-based ordering was considered and rejected
this session (`asc` puts old past rides before upcoming ones; `desc` is
only directionally better), deferred to CR-025 ("Filters"). 4 new
`apps/api` tests (120 total, was 116); `apps/web` gained 4 new tests and
lost 1 (the removed CR-002 bootstrap smoke test) — 81 total, was 78.
Live-verified via curl against a real Postgres + `apps/api` (empty
collection, a draft ride excluded, six rides driven through every
non-draft status all appearing with the correct organizer cross-checked
against a direct DB read, pagination followed across a real second page, a
malformed cursor 400) and a full browser walkthrough via the
`browser-automation` skill against a real `next dev` server + `apps/api`
(unauthenticated: `/` rendered a published and a cancelled test ride as
cards, the draft ride did not appear, clicking a card correctly navigated
into `/rides/[id]`) — 0 console errors, 0 failed requests.

Filters (public discovery) landed 2026-09-15 (CR-025, see
`docs/changelog.md`): `?bicycleType=road|gravel|mtb|any` on `GET /v1/rides`
— the one filter dimension this ticket ships, `packages/types`'
`listPublicRidesQuerySchema` (`/mine` keeps the unextended schema). Also
resolves KI-029: `listPublicRides` now makes "upcoming" (`startsAt >= now`,
computed fresh per call) an unconditional part of the endpoint, not a
toggleable filter (`docs/product.md` Principle 3) — `startsAt asc`
(soonest-first) is now the correct default sort, distinct from `/mine`'s
unchanged `createdAt desc`. `apps/api/src/lib/cursor.ts`'s `CursorKey`
field generalized from `createdAt` to `sortValue` (internal rename only,
cursor stays opaque) so both endpoints share the pagination helper while
sorting by different columns. `apps/web` gained
`features/participant/discovery/components/RideFilters.tsx` — a plain
native `<select>`, not a new `packages/ui` primitive (KI-020 stays open).
`DiscoveryList` now renders two distinct empty states: the existing
unfiltered one and a new filtered one ("Пока нет заездов по этим
фильтрам" + "Сбросить фильтры", exact copy `docs/design.md` §10 already
quoted since CR-066). New KI-030: distance/difficulty/price/date-range
filters remain deferred (no design-doc backing yet). 2 new `apps/api`
tests (122 total, was 120) plus a rewritten pagination test (soonest-first,
not newest-created); `apps/web` gained 2 new tests (83 total, was 81).
Live-verified via curl against a real Postgres + `apps/api` (a past
published ride excluded outright; two future rides created out of
chronological order returned soonest-first; `?bicycleType=road` returned
only the road one) and a full browser walkthrough via the
`browser-automation` skill against a real `next dev` server + `apps/api`
(soonest-first ordering, past ride absent, MTB filter showing the filtered
empty state with a working reset, road filter narrowing correctly) — 0
console errors, 0 failed requests.

Version control is live: git repository on branch `main`, remote `origin` =
`https://github.com/ipoderator/coffee_ride_app` (public).

Hardened 2026-09-11 before CR-001 (see `docs/changelog.md`):

- Node 24 LTS, `pnpm@10.34.5` pinned exactly; CI runs the root ESLint config and has a
  restricted token;
- `turbo.json` declares its environment (Turborepo 2 strict env mode);
- API contract fixed: `/v1`, cursor pagination, RFC 9457 errors (ADR-011);
- time model fixed: `timestamptz` everywhere + ride-local IANA timezone (ADR-012);
- sessions and origin topology decided: database-backed sessions, single origin with
  `/api` behind the proxy (ADR-013);
- 2GIS keys split into public MapGL and server-only Geocoder/Directions;
- local infrastructure ports bound to `127.0.0.1`.

Reformatted 2026-09-12 (CR-087): whole repository now matches `.prettierrc`
(`prettier --check .` passes); formatting-only, no content changed (see
`docs/changelog.md`).

Monorepo tooling initialized 2026-09-12 (CR-001, see `docs/changelog.md`):
`pnpm-lock.yaml` generated (`npx pnpm@10.34.5`, no pnpm/corepack installed globally on
this machine — fixes KI-008), `tsconfig.base.json` added for future packages to extend,
`.prettierignore` added for the lockfile, and `format:check`/`lint:root`/turbo-delegated
`lint`/`typecheck`/`test`/`build` all verified to exit 0 against zero workspace packages.

`apps/web` scaffolded 2026-09-12 (CR-002, see `docs/changelog.md`): Next.js 15.5.25
(App Router, `src/` dir), React 19.3.0, TypeScript pinned to `6.0.3` (not latest —
`typescript-eslint` compatibility), Tailwind CSS v4, shadcn/ui foundation
(`components.json`, `cn` helper, baseline neutral theme — real tokens are CR-063).
Root `eslint.config.mjs` now ignores `apps/**`/`packages/**` (workspace members lint
via their own config through `turbo lint`); this leaves lint-staged's pre-commit step
not covering `apps/*` ESLint (KI-012, deferred to CR-010). `turbo lint/typecheck/build`
verified green; `next build` output smoke-tested with `next start` + `curl`.

`apps/api` scaffolded 2026-09-12 (CR-003, see `docs/changelog.md`): Fastify 5.12.4,
ESM, `@fastify/type-provider-zod` (typed Zod validation + OpenAPI generation),
`@fastify/swagger`/`swagger-ui` at `/docs`. Global RFC 9457 (`application/
problem+json`) error handler with Zod validation errors mapped into `errors[]`.
`/health` bootstrap stub (`{ status: 'ok' }`, no dependency checks — CR-051 upgrades
it); `/v1` prefix wired, empty (first route is CR-011). Env validated via Zod at
startup (CR-073, `src/env.ts`): full `.env.example` surface typed, refuses to boot
when `NODE_ENV=production` and a value matches a known placeholder/local default
(`AUTH_SECRET=change-me`, MinIO defaults, `localhost` in `DATABASE_URL`/`REDIS_URL`/
`S3_ENDPOINT`). TypeScript pinned to `6.0.3` (same ceiling as `apps/web`, see
CR-002). Local dev loads one root `.env` via Node's native `process.loadEnvFile()`
(no `dotenv` dependency). Decisions locked via a `/grill-me` session before
implementation (ESM, OpenAPI-now, health-stub-now, ADR-011's example `type` URI,
`API_PORT` naming, full-schema env validation) — all recommended options accepted.
Smoke-tested live: `/health` (200), unknown route (404, correct envelope), a
temporary Zod-validated route with a bad payload (400, `errors[]` populated
correctly), compiled `dist/server.js` boots identically to `tsx` dev mode,
production-mode boot correctly refuses on a placeholder `AUTH_SECRET`.

`packages/db` scaffolded 2026-09-12 (CR-004, see `docs/changelog.md`): Drizzle
ORM (`postgres-js` driver, `drizzle-orm@^0.45.2`) + `drizzle-kit@^0.31.10`. Asked
the user directly (one question, not a full grill session): empty schema vs
shipping a `users` table now — user picked empty schema (recommended). Zero
domain tables committed; `src/client.ts` exports a `createDbClient(
connectionString)` factory (library, not an env-reading singleton — `apps/api`
will call it once a route needs the DB, starting CR-011); `src/migrate.ts` is
the standalone migration-runner CR-076 reuses at deploy time. Docker wasn't
available in this environment (daemon didn't come up), so validation ran
against the machine's local Homebrew Postgres instead: generated a scratch
table's migration, applied it, queried it through `createDbClient`, then
removed everything, leaving only the genuine drizzle-kit-initialized empty
`migrations/meta/_journal.json`. Needed an explicit `"types": ["node"]` in its
tsconfig for bare Node globals to resolve (KI-013 — apps/api never hit this
because every file there already imports something from `fastify`, which
pulls in `@types/node` incidentally).

Redis client factory added 2026-09-12 (CR-005, see `docs/changelog.md`):
`apps/api/src/redis.ts`, `ioredis@^6.0.0` (chosen for future BullMQ
compatibility — CR-050's notification queue needs it), same factory shape as
`createDbClient`. Not wired into any route (ADR-004: "only when justified" —
no consumer until CR-050/CR-058). Docker's daemon did not come up in this
environment and, unlike CR-004, there was no already-running local Redis to
fall back to — installing one via Homebrew for this session was declined, so
the live connection is genuinely unverified (KI-014, not silently skipped).

S3 client factory added 2026-09-12 (CR-006, see `docs/changelog.md`):
`apps/api/src/s3.ts`, `@aws-sdk/client-s3@^3.1131.0` (portable across every
S3-compatible provider — ADR-005 leaves the production one deployment-specific
— not MinIO's own client), `forcePathStyle: true` for MinIO/non-AWS
compatibility. No separate `packages/storage-*` split: unlike maps (ADR-010),
S3 has no vendor-SDK-leak problem to isolate behind a second package. Not wired
into any route (first consumer is CR-027 GPX upload or CR-086's cover image
pipeline). Docker's daemon failed to come up a third consecutive time across
CR-004/CR-005/CR-006 — recorded as a standing environment constraint in
Claude's project memory (`docker-desktop-unavailable`) rather than
re-investigated per task; live connection unverified (KI-015).

GPX upload landed 2026-09-15 (CR-027, together with its prerequisite CR-085,
see `docs/changelog.md`): the Route section's first ticket, and `apps/api`'s
first real S3 consumer (KI-015). `packages/db` gained its fifth table,
`routes` — one per `Ride` (`rideId` unique FK, `ON DELETE CASCADE`), holding
the uploaded GPX file's S3 key/filename/size plus metrics computed from the
track itself (`distanceKm`/`elevationGainMeters`/`pointCount`, haversine sum
/ positive-elevation-delta sum) and the ordered `{lat,lng,elevationMeters}[]`
polyline as a single `jsonb` column — deliberately not a row-per-point table
(that shape belongs to the distinct, smaller `RoutePoint` entity, CR-031,
per `docs/database.md`'s own domain descriptions). New `apps/api/src/modules/
rides/gpx.ts` (streaming SAX parser, ADR-015) and `route-storage.ts` (a
module-scoped S3 timeout+bounded-retry wrapper — CR-049's shared version
isn't built yet). `POST`/`PATCH`/`DELETE /v1/rides/:id/route` (multipart,
`@fastify/multipart`, draft-only, same ownership rules as `PATCH /v1/rides/
:id`) plus a new `GET /v1/rides/:id/route/download` endpoint (not in the
original `docs/api.md` sketch — added to fulfill `docs/product.md`'s
"downloadable track" promise, same viewer-visibility rule as `GET /v1/rides/
:id`). `GET /v1/rides/:id` gained an additive `route: RouteSummary | null`
field (a summary only, no full `geometry` — new KI-035). Found and fixed a
real pre-existing bug along the way: `apps/api/src/plugins/error-handler.ts`
unconditionally redacted every `>=500` status to a generic `internal_error`
— correct for a genuinely unexpected failure, but wrong for CR-027's own
deliberate `route_storage_unavailable` (503), the first domain error in this
codebase with a `>=500` status; fixed by keying the redaction on whether the
error carries a `title` (the same signal already used below 500), caught by
the new test suite itself (500 instead of the expected 503) before it ever
reached this changelog entry. New `apps/web/src/features/organizer/route/`
feature module and `/organizer/rides/[id]/route` screen (loading/not-found/
error/empty/success/degraded states; the degraded state — S3 unreachable or
unconfigured — reuses `ErrorState tone="warning"`, exact copy "Загрузка
недоступна. Попробуйте ещё раз позже." per `docs/design.md` §10).
`EditRideForm` gained a "Маршрут →" link into it. `packages/ui` gained
`RIDE_ROUTE_TERMS`; `packages/types` gained `domain/route.ts`. New
dependencies: `sax`, `@fastify/multipart`. 151 `apps/api` tests (was 126,
+18 route-routes +7 gpx-unit), 95 `apps/web` tests (was 85, +10). No live
MinIO in this environment (Docker unreachable, KI-019/KI-015 standing
constraint) — the S3 code path is unit-tested with `S3Client.send` mocked
(same technique CR-008 used for `maps-2gis`'s `fetch`); live-verified via
curl that the _degraded_ path is correct (`503 route_storage_unavailable`,
no orphaned `routes` row) and via the `browser-automation` skill that the
non-S3-dependent screen states (empty/loading/degraded/draft-gate) all
render correctly — 0 unexpected console errors in either walkthrough.
`Route.distanceKm`/`elevationGainMeters` (GPX-computed) are deliberately not
reconciled with `Ride`'s own organizer-entered fields (new KI-034, CR-029's
job to resolve). Route section: CR-028/029/030/031 remain.

## In progress

None.

## Next

`docs/tasks.md`'s Route section has three remaining tickets after CR-027
("GPX upload", done): CR-028 ("Route rendering" — likely blocked on the same
missing `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` as KI-031 for the map half, but an
elevation-profile chart from `Route.geometry` doesn't need 2GIS), CR-029
("Route metadata" — the natural place to resolve KI-034's `Route`/`Ride`
distance-elevation mismatch), CR-030 ("Stops") and CR-031 ("Route points" /
`RoutePoint`, the organizer-placed typed-marker entity, distinct from
`Route.geometry`) — the latter two have no dependency on CR-028 at all and
could go first if CR-028 stays blocked on the missing credential.

## Important decisions

See `docs/decisions.md`. Notably:

- ADR-008: modular monolith, not microservices — failure isolation via
  `.claude/rules/resilience.md`, not via service boundaries.
- ADR-009: feature-module architecture for organizer/participant cabinets — see
  `.claude/rules/extensibility.md`.
- ADR-006 + ADR-013: email+password, capability-based authorization, database-backed
  sessions, single-origin deployment with `SameSite=Lax` + `Origin` check for CSRF and no
  CORS. Full checklist in `.claude/rules/security.md`.
- ADR-010: maps provider (2GIS) accessed only through `packages/maps-core` /
  `packages/maps-2gis` adapter split.
- ADR-011: `/v1` prefix, cursor pagination on every collection, RFC 9457 error envelope.
- ADR-012: `timestamptz` everywhere; `Ride` also stores its start location's IANA zone.
- ADR-014: map discovery's geo query is plain `startLat`/`startLng` columns + a bbox
  range query (composite B-tree index), not PostGIS — no named radius-search use case,
  no PostGIS in the current Postgres image.
- ADR-015: GPX upload is bounded by a 10 MB size cap (`@fastify/multipart`) plus a
  streaming SAX parse (`sax`), not a worker thread — revisit only if a real perf
  problem is measured at scale.
- Design direction (not an ADR — see `docs/design.md`): calm, low-saturation palette,
  warm neutral base with one muted teal-green accent; metric presentation modeled on
  Strava/TrainingPeaks/Rouvy. One exception: `danger` is a bright red (`#D42B20` /
  `#FF5A4F`), reserved for cancellation and failure, allowed as a filled badge
  (`StatusBadge`, CR-065) and, since CR-021, a filled `Button` (`variant="danger"`).

## Known limitations

Full list with IDs and next actions: `.claude/context/known-issues.md`. In short:

- nothing exists for deployment — no Dockerfile, manifest, proxy config, backups,
  observability (KI-001, KI-002, KI-006; CR-074..CR-079);
- Redis is unauthenticated and without persistence (a basic `redis-cli ping`
  healthcheck was added in CR-009; KI-003, CR-077);
- `docker-compose.yml` (all three services) has never been booted live in this
  environment — Docker's daemon is unreachable here (KI-019); MinIO's
  healthcheck/image-pinning bugs were fixed in CR-009 (KI-004/KI-005, resolved
  as KI-R07/KI-R08) but only config-validated, not live-verified;
- CI cannot test uploads and does not run e2e (KI-007, CR-080 — Vitest now
  runs in CI via the existing `Test` step, but Playwright does not); the
  install step (KI-008) and the Format check step (KI-011) are both resolved;
  all eight workspace members (`apps/web`, `apps/api`, `packages/db`/`types`/
  `ui`/`config`/`maps-core`/`maps-2gis`) lint/typecheck/build clean via
  `turbo`; three of them (`apps/api`, `apps/web`, `packages/maps-2gis`) now
  have real passing Vitest suites (CR-008), the other five intentionally
  don't yet (nothing real to test);
- `apps/api`'s Redis client (CR-005) has never been connected to a live
  service — Docker unavailable all session, no local fallback (KI-014;
  verify before CR-050/CR-058 consumes it). The S3 client (CR-006) is now a
  real, tested-but-mocked-only code path as of CR-027 (GPX upload) — still
  never connected to a live MinIO (KI-015, widened, not resolved);
- `packages/maps-2gis`'s Geocoder/Routing response parsing is unverified
  against a live 2GIS account (KI-016);
- KI-017: `packages/db`/`packages/types`/`packages/maps-2gis` export raw TS
  source rather than compiled `dist` output — **confirmed live and blocking**
  as of CR-011 (`node dist/server.js` crashes under `NODE_ENV=production`
  once `apps/api` has a real runtime — not type-only — consumer of `db`);
  resolving it is an architecture/tooling decision deferred pending an ADR;
- KI-022 (CR-011, narrowed CR-012): auth endpoints still ship with an interim
  posture — in-memory per-IP-only rate limiting (no Redis, no per-account
  limiting; CR-058), no `@fastify/helmet` yet (CR-061, now headers-only).
  The CSRF gap this entry originally tracked is closed as of CR-012
  (`apps/api/src/plugins/csrf.ts`). Do not deploy publicly before CR-061
  lands;
- contract/model follow-ups: registration idempotency, geo query approach, GPX parsing off
  the event loop, cover image pipeline (KI-009, CR-083..CR-086);
- the ADR-010 map boundary is held by review discipline only until CR-056 (KI-010);
- production 2GIS credentials, notification provider (ADR-007 Pending) and S3 provider are
  still absent;
- `docs/api.md` describes `forgot-password`/`reset-password` endpoints that have no
  implementation yet (contract-first, deliberate; CR-060) — register/verify-email
  (CR-011), login/logout/`me` (CR-012), and `PATCH /v1/users/me` (CR-013) are all
  implemented (this line was stale before CR-013 — login/logout/`me` had already
  shipped in CR-012 without it being corrected here);
- `docs/design.md` exists and CR-063..CR-066 now implement its tokens, formatters,
  metric components, and state primitives in full; CR-011 is the first real screen
  built on top of them;
- KI-020: `apps/web/components.json`'s shadcn alias still points into `apps/web`, not
  `packages/ui` — `Skeleton` (CR-066) and `Button`/`Input`/`Card` (CR-011) are real
  shadcn primitives hand-vendored directly instead (structurally trivial enough not
  to need the CLI); the alias/CLI-targeting question stays open for the first
  structurally complex primitive (`Dialog`/`Select`/...) a future CR needs;
- KI-021: `RideService`/registration-state keys in `packages/ui/src/terminology.ts` are
  provisional pending the real `RideService` DB enum (not yet scheduled with a CR
  number) — ride status/bicycle type are unaffected, already sourced from
  `docs/product.md`.
- new (CR-013): profile avatar/photo upload is not implemented — deferred to
  whichever CR wires up the S3 pipeline (KI-015/CR-086); `phone`'s format check
  is deliberately loose, not real E.164 validation; the participant cabinet nav
  registry (`apps/web/src/lib/cabinet/participant-nav.ts`) has exactly one entry
  and no feature-flag support — CR-054 generalizes it (widgets, organizer side,
  flags) rather than this ticket.
- new (CR-014): no public `GET /v1/organizers/:id` yet — nothing reads
  organizer data publicly until `Ride` exists; organizer logo/avatar upload is
  the same S3-pipeline-deferred gap as KI-023, not a new one; organizer
  capability itself has no server-side authorization check to protect anything
  with yet (CR-016 is explicitly that, once `Ride`/CR-017+ gives it something
  organizer-owned); `ORGANIZER_NAV_ITEMS` has exactly one entry, same
  no-feature-flag-yet caveat as the participant registry (CR-054).
- new (CR-015): `ORGANIZER_WIDGETS` has exactly one entry and no feature-flag
  support, same caveat as `ORGANIZER_NAV_ITEMS`/`PARTICIPANT_NAV_ITEMS`
  (CR-054 generalizes all of these).
- new (CR-017): `RideRequirement`/`RideService` still have no CR number
  (KI-021's sibling gap); `Ride.coverImageUrl` joins the KI-023 gap a third
  time.
- new (CR-088/CR-016/CR-018): no public `GET /v1/rides` yet (CR-024, the
  discovery list — distinct from this session's organizer-scoped `GET /v1/
rides/mine`); publishing/cancelling/finishing a ride are still separate,
  unimplemented tickets (CR-019/CR-021/CR-022) — `PATCH /v1/rides/:id`
  deliberately refuses to touch `status` at all. KI-024 (no "My rides" list)
  is resolved.
- new (CR-019): cancelling/finishing a ride are still unimplemented
  (CR-021/CR-022); no `/verify-email` web screen exists anywhere in
  `apps/web` (only the API call CR-011 built), so an organizer who hits
  `email_verification_required` (this ticket or CR-014's) has no in-app way
  to actually verify — new KI-026, and CR-059 checking off in `docs/tasks.md`
  only closes its "gate organizer publish" scope, not this gap.
- new (CR-089/CR-020): KI-025 resolved — `registration_open`/
  `registration_closed` are both reachable now. Cancelling/finishing a ride
  are still the only remaining unimplemented lifecycle transitions
  (CR-021/CR-022); KI-026 (no `/verify-email` screen) is unaffected —
  neither new endpoint gates on `emailVerified`.
- new (CR-021): finishing a ride is now the only remaining unimplemented
  lifecycle transition (CR-022). KI-026 (no `/verify-email` screen) is
  unaffected — `cancel` doesn't gate on `emailVerified` either. No organizer
  UI exists yet to see _why_ a ride was cancelled (no reason/note field in
  `docs/product.md`'s Ride fields) — not a gap this ticket introduces, since
  the product spec never asked for one; flagging only in case a future ticket
  (participant-facing cancellation notice, CR-023/CR-040s notifications)
  needs it and assumes it already exists.
- new (CR-090/CR-022): KI-027 resolved — `started` is reachable now, and the
  full ride lifecycle (`draft` through `cancelled`/`finished`) is
  implemented end to end for the first time. KI-026 (no `/verify-email`
  screen) is unaffected — neither `start` nor `finish` gates on
  `emailVerified`. The same "no reason/note field" caveat CR-021 flagged for
  cancellation applies identically to `finish` — `docs/product.md`'s Ride
  fields have no post-ride notes/results field, so there's nothing yet for a
  future participant-facing "ride summary" screen to show beyond the status
  itself; not a gap this ticket introduces.
- new (CR-023): KI-028 — route/stops/services/requirements/registration
  action have no data model yet (CR-027..036) so `/rides/[id]` can't show
  them. `GET /v1/rides/:id`'s visibility change (owner-only -> any viewer
  once non-`draft`) is additive for the one existing caller (`EditRideForm`,
  always the owner); no other caller exists yet.
- new (CR-024): KI-028 narrowed — the "no discovery entry point" half is
  resolved (`/` now links every published+ ride into `/rides/[id]`); the
  route/stops/services/requirements/registration half stays open.
- new (CR-025): KI-029 resolved — discovery now excludes past rides
  outright and sorts `startsAt asc` (soonest-first). New KI-030: only
  `bicycleType` is filterable; distance/difficulty/price/date-range
  filters remain deferred (no design-doc backing yet).
- new (CR-026/CR-084, ADR-014): `rides.startLat`/`startLng` cover the start
  point only — no `finishLat`/`finishLng` (new KI-033, no named use case
  yet). No geocode-by-address UI exists (new KI-032, blocked on KI-016);
  coordinates are entered manually. No live 2GIS MapGL rendering exists yet
  either (new KI-031, also blocked on KI-016) — `/`'s "Карта" tab always
  shows a live-verified degraded notice, never a blank pane or a fake map.
  `packages/maps-core`/`packages/maps-2gis` are unchanged by this ticket.
- new (CR-027/CR-085, ADR-015): `Route.distanceKm`/`elevationGainMeters`
  (GPX-computed) and `Ride`'s own organizer-entered fields are not
  reconciled (new KI-034 — CR-029 "Route metadata" is where to decide this
  deliberately). `GET /v1/rides/:id`'s `route` field is a summary only, no
  full `geometry` array yet (new KI-035 — CR-028 "Route rendering" decides
  how the polyline/elevation-profile UI reads it). The S3 upload/download/
  delete code path is real now but only unit-tested with the S3 client
  mocked — never live-verified against MinIO (KI-015, widened, not new).
- new (CR-028): KI-035 resolved — `GET /v1/rides/:id/route/geometry` serves
  the full point array, live-verified end to end (visibility rules +
  content). KI-031 widened — `/rides/[id]`'s new route map section hits the
  same missing-2GIS-credential gap CR-026 found for discovery, a second
  surface, not a new root cause. `apps/web` gained its first real dependency
  on `packages/maps-core` (type-only).

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
- feature-module isolation between organizer/participant cabinet features
  (`.claude/rules/extensibility.md`).

## Last updated

2026-09-15 (CR-028)
