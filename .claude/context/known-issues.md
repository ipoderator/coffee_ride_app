# Known Issues

Blockers, unresolved bugs, external integration limitations, and technical debt that must
survive between Claude Code sessions.

Each issue: ID; status; discovered date; problem; impact; workaround; next action.

---

## Open

### KI-001 — No deployment artifacts exist

Status: open. Discovered: 2026-09-11 (pre-foundation audit).
Problem: no `Dockerfile`, no `.dockerignore`, no production manifest, no reverse proxy
config. `docker-compose.yml` is local development infrastructure only and says so.
Impact: the project cannot be deployed to a server at all.
Workaround: none needed yet — there is no application code to deploy.
Next action: CR-074, CR-075.

### KI-002 — Migration execution during deploy is undefined

Status: open. Discovered: 2026-09-11.
Problem: nothing says who runs `drizzle-kit migrate` on the server. Running it on
application boot races when several API instances start together.
Impact: possible partial/concurrent migrations on the first multi-instance deploy.
Next action: CR-076.

### KI-003 — Redis has no password, no persistence, no healthcheck

Status: open. Discovered: 2026-09-11 (partly recorded earlier in project-state.md).
Problem: the `redis` service runs unauthenticated, without AOF, and without a healthcheck.
Impact: on a server, an unauthenticated Redis is a takeover vector; without AOF, a restart
silently drops queued notification jobs (CR-050), which contradicts
`.claude/rules/resilience.md` (a failed background job must never silently disappear).
Workaround: ports are now bound to `127.0.0.1`, which contains the exposure locally.
Next action: CR-077.

### KI-006 — No observability

Status: open. Discovered: 2026-09-11.
Problem: no structured logging, request ids, error reporting, or metrics are specified.
Impact: `.claude/rules/resilience.md` requires background job failures to be visible;
there is currently no mechanism that could make them visible.
Next action: CR-079.

### KI-007 — CI cannot test uploads or run e2e

Status: open. Discovered: 2026-09-11.
Problem: no MinIO service, no migration step, no Playwright job in `.github/workflows/ci.yml`.
Impact: the three critical journeys named in `.claude/rules/testing.md` are never verified
automatically.
Next action: CR-080.

### KI-008 — CI fails at `pnpm install --frozen-lockfile`

Status: resolved 2026-09-12 (CR-001). Discovered: 2026-09-10.
Problem: no `pnpm-lock.yaml` until CR-001 initialized the workspace tooling.
Impact: red CI until Foundation lands. Not a regression.
Resolution: `pnpm-lock.yaml` generated and committed; `pnpm install
--frozen-lockfile`, `format:check`, `lint:root`, and turbo-delegated
`lint`/`typecheck`/`test`/`build` all verified locally against zero
workspace packages. CI will still have nothing to actually build/test until
`apps/*`/`packages/*` exist (CR-002..CR-007), but the install step itself is
no longer the blocker.

### KI-009 — Contract/model follow-ups found in the audit

Status: open. Discovered: 2026-09-11.
Problem: registration is not idempotent against network retries (CR-083); the geo query
approach for map discovery is undecided (CR-084); GPX parsing would block the Node event
loop if done synchronously in a request (CR-085); the cover image pipeline is unspecified
(CR-086).
Impact: each is cheap to address before the related feature is built and expensive after.
Next action: CR-083..CR-086, each before its dependent feature task.

### KI-011 — The repository has never matched its own Prettier config

Status: resolved 2026-09-12 (CR-087). Discovered: 2026-09-11.
Problem: `prettier --check .` failed on 37 files, and it failed identically on the initial
commit — this predated any current work. The differences were cosmetic (blank lines
after headings/before lists, markdown emphasis style, YAML quote style) but touched every
matched file end to end.
Impact: CI's `Format check` step failed before it ever reached lint/typecheck, for
reasons unrelated to whatever change was being tested.
Resolution: ran `prettier --write .` as one isolated formatting-only commit; `prettier
--check .` now passes on the whole repository. No content/behavior changed.

### KI-010 — ADR-010 map boundary is enforced by review only

Status: open. Discovered: earlier; restated 2026-09-11.
Problem: the lint rule forbidding direct 2GIS SDK imports outside `packages/maps-2gis`
does not exist yet.
Next action: CR-056.

### KI-014 — `apps/api`'s Redis client was never connected to a live Redis

Status: open. Discovered: 2026-09-12 (CR-005).
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

### KI-015 — `apps/api`'s S3 client was never connected to a live MinIO

Status: open — now a real code path, still unverified. Discovered: 2026-09-12
(CR-006). Widened: 2026-09-15 (CR-027).
Problem: same root cause as KI-014 — Docker's daemon did not come up in this
environment (confirmed across CR-004/CR-005/CR-006/CR-027; recorded as a
standing environment constraint, not re-litigated per task — see
`docker-desktop-unavailable` in Claude's project memory). `src/s3.ts`
(`createS3Client`) was only typechecked/linted/built through CR-006.
Update 2026-09-15 (CR-027, "GPX upload"): this is now `apps/api`'s first real
S3 consumer (`plugins/s3.ts`, `modules/rides/route-storage.ts`) — a real,
non-trivial code path (upload/download/delete with a timeout + bounded
retry, ADR-015) exists and is exercised by 18 `route.routes.test.ts` tests,
but every one of them mocks `@aws-sdk/client-s3`'s `S3Client.send` (same
technique CR-008 used for `maps-2gis`'s `fetch`) — none has ever run against
a real MinIO. Live-verified via curl instead that the _degraded_ path is
correct: with no `S3_*` env configured, `POST /v1/rides/:id/route` returns
`503 route_storage_unavailable` (not a 500, not a hang), and no orphaned
`routes` row was left behind (upload happens before the DB insert).
Impact: medium now (was low) — a real feature (GPX upload) depends on this
client actually working against production S3/MinIO, unlike CR-006's
dormant wrapper. `CR-086`'s cover image pipeline will hit the identical gap.
Workaround: none needed for correctness — the degraded-response contract
(`503 route_storage_unavailable`) is itself verified; only the _successful_
upload/download/delete round trip against a real store is unverified.
Next action: the first session with a working Docker daemon should run
`docker compose up -d minio`, confirm a real `PutObject`/`GetObject`/
`DeleteObject` round trip against it (e.g. via `route-storage.ts`'s
functions directly, or a full `POST /v1/rides/:id/route` → download → delete
walkthrough), before trusting this in any CR-086 or production-facing work.

### KI-016 — 2GIS Geocoder/Routing response parsing is unverified against a live API

Status: open. Discovered: 2026-09-12 (CR-007).
Problem: `packages/maps-2gis`'s field names (`point.lat`/`lon`, `full_name`,
`distance`/`duration`, route geometry) come from 2GIS's public documentation
and search results, not a real request/response — no `MAPS_2GIS_API_KEY` is
configured in this environment, and `.claude/rules/maps.md` itself defers
that verification to "before production integration."
Impact: low today (zero consumers — see KI-017's same "not wired in yet"
point), but real: a wrong field name would silently produce empty/degraded
results rather than an obvious error, since parsing is deliberately
defensive (falls back to the requested waypoints as route geometry if the
response doesn't carry one).
Workaround: none needed yet — nothing calls this code.
Next action: verify against a real 2GIS account (a geocode call, a route
call, inspect the actual response) before CR-026 (map discovery), CR-028
(route rendering), or CR-084 (geo query approach) wires this adapter into a
real route.

### KI-017 — `packages/maps-2gis`/`packages/db`/`packages/types` export raw TS source, not compiled `dist`

Status: open — **confirmed live and now blocking** (CR-011; was previously a
predicted-but-unverified risk). Discovered: 2026-09-12 (CR-007).
Problem: `packages/db`, `packages/types`, and `packages/maps-2gis`'s
`package.json` `main`/`types`/`exports` all point at `./src/*.ts`, not
`./dist/*.js`. `tsx` (dev, `vitest`) and `tsc` (typecheck, and build-time type
resolution) both handle that fine. But `packages/db`'s `createDbClient` and
`packages/types`' `registerRequestSchema`/`verifyEmailRequestSchema` (real
runtime values, not types — unlike `ProblemDetails`/`Paginated<T>`, which are
`import type` and fully erased) are not: a plain `node` process resolving
either package's package.json `main`/`exports` lands on a `.ts` file, and
Node has no loader registered to understand that extension outside `tsx`.
`packages/maps-core` is unaffected by construction (100% type-only
interfaces).
Impact: **confirmed this session (CR-011)**, not hypothetical — `apps/api`
got its first real runtime consumer of `db` (the auth module) and of `types`'
Zod schemas (`auth.routes.ts`). Live-tested `NODE_ENV=production node
dist/server.js` (mirroring CR-003's original compiled-boot smoke test) after
`pnpm --filter api build`: it crashes immediately —
`ERR_MODULE_NOT_FOUND: Cannot find module '.../packages/db/src/schema/
index.js' imported from '.../packages/db/src/client.ts'` (Node's native
`.ts` type-stripping loads `client.ts` itself, since that's the literal file
`db`'s `exports` names, but does not rewrite `client.ts`'s own `.js`-suffixed
relative import of its NodeNext-style sibling `schema/index.ts`). `types`
would very likely fail the identical way immediately after (untested past the
first crash — `db` resolves first in `apps/api`'s import graph).
`apps/web`'s equivalent problem (webpack, not plain `node`, trying to bundle
`types`' `.js`-suffixed relative imports) was fixed differently and does not
need this: a `resolve.extensionAlias` entry in `next.config.ts` teaches
webpack the same `.js`→`.ts` mapping `tsc`/`tsx` already understand. That
fix is scoped to webpack/`apps/web` only — it does nothing for `apps/api`'s
compiled output running under plain `node`.
Workaround: none for production. `apps/api`'s actual CR-011 acceptance
criteria (dev-mode live check via `tsx`, all four `vitest` suites, `tsc`
typecheck/build) are unaffected — none of them execute `dist/server.js`
under plain `node`. This is a real, separate gap from any of those, on the
production-boot path only.
Next action: before `apps/api` is ever deployed for real (CR-074+), resolve
this — either (a) switch `db`/`types` to declaration-based `dist` exports
(`"types": "./dist/index.d.ts"`, `"main"/"exports"` pointing at `dist`,
`"declaration": true` in their `tsconfig.json`) and add a `predev`/watch
build step so `apps/api`'s `tsx watch` dev flow keeps working without a
manual build first, or (b) switch `apps/api`'s own `build` script to a
bundler (esbuild/tsup) that inlines workspace-package source instead of
leaving cross-package `import`s for Node to resolve at runtime — either is an
architecture/tooling decision (`.claude/rules/architecture.md`'s change
control) that needs an explicit ADR, not a silent fix inside a feature
ticket, which is why CR-011 documents this rather than resolving it
unilaterally. Re-run the same `NODE_ENV=production node dist/server.js`
smoke test after whichever fix lands.

### KI-018 — `packages/config`'s shared tsconfig fragment broke under Vite 8's oxc transform

Status: resolved 2026-09-12 (CR-008, same session it was discovered in).
Problem: `packages/types`/`maps-core`/`maps-2gis`'s `tsconfig.json` extended
`config/tsconfig/node-library.json` (a bare package specifier, resolved
through the pnpm workspace symlink), which itself extended
`../../../tsconfig.base.json`. `tsc` resolves each hop of a chained
`extends` relative to the file that defines it and handles this fine (this
is how CR-007 shipped it) — but Vite 8's default `vite:oxc` transform plugin
(used by Vitest 5, only exercised once `packages/maps-2gis` got a
`vitest.config.ts` in CR-008) resolves a nested `extends` relative to the
_original_ consuming tsconfig's directory instead, and failed with
`TSCONFIG_ERROR: Failed to load tsconfig 'tsconfig.base.json': Tsconfig not
found`.
Impact: blocked `packages/maps-2gis`'s Vitest suite entirely (0 tests
collected); `apps/api`/`apps/web` were unaffected since neither's tsconfig
goes through `packages/config` at all.
Resolution: `packages/config/tsconfig/node-library.json` no longer extends
`tsconfig.base.json` itself; every consumer (`packages/types`, `maps-core`,
`maps-2gis`) now extends both directly as a TS 5+ array —
`"extends": ["../../tsconfig.base.json", "config/tsconfig/node-library.json"]`
— so no hop is ever chained through an intermediate file. Verified: `turbo
build`/`typecheck` still green for all three (unaffected by construction),
and `packages/maps-2gis`'s Vitest suite now collects and passes.

### KI-019 — `docker-compose.yml` has never been booted live in this environment

Status: open. Discovered: 2026-09-13 (CR-009).
Problem: the Docker daemon does not come up in this Claude Code environment (same
standing constraint already hit in CR-004/CR-005/CR-006 — see
`docker-desktop-unavailable` in Claude's project memory; `docker info` fails,
`docker compose up -d` fails with "Cannot connect to the Docker daemon"). CR-009
brought the compose file itself to a correct state (KI-004/KI-005 fixed below) and
validated it with `docker compose -f docker-compose.yml config`, which parses/
resolves the file but does not pull images, run healthchecks, or prove the services
actually start and become healthy together.
Impact: low today (no application code connects to these services yet — `apps/api`'s
Redis/S3 clients are separately tracked as unverified in KI-014/KI-015, and
`packages/db`'s Postgres connection was verified in CR-004 against a local Homebrew
Postgres instead, not compose). But the compose file as a whole — three services,
their healthchecks, and the new MinIO image/registry from this task — has literally
never been started end to end by any session.
Workaround: `docker compose -f docker-compose.yml config` is a reasonable syntax/
interpolation check and was run clean after every change in CR-009.
Next action: the first session with a working Docker daemon should run `docker
compose up -d` followed by `docker compose ps` (confirm all three reach `healthy`,
not just `running`) before trusting this file for CR-050/CR-058/CR-027/CR-086's live
verification work (KI-014/KI-015/KI-016).

### KI-021 — `RideService`/registration-state keys in the terminology module are provisional

Status: open. Discovered: 2026-09-13 (CR-064).
Problem: `docs/design.md` §13 lists the Russian labels for 10 services and 4 registration
action/state strings, but `docs/product.md` §Services only names the services in free-text
English (`food, water, coffee, support vehicle, mechanic, medical support, transfer,
bicycle transport, parking, changing room/shower`), not as enum keys — no `RideService` DB
enum exists yet (`packages/db` has zero domain tables), and no `Registration` status enum
exists either. `packages/ui/src/terminology.ts`'s `RIDE_SERVICE_TERMS`/
`REGISTRATION_ACTION_TERMS` therefore had to mint snake_case keys (`support_vehicle`,
`medical_support`, `bicycle_transport`, `changing_room`; `register`/`cancel`/`waitlisted`/
`full`) rather than reuse an authoritative source.
Impact: low today (nothing consumes these keys yet). Real risk: whichever CR defines the
actual `RideService` DB enum (routes/stops/services work, not yet scheduled with a CR
number in `docs/tasks.md`) could pick different key spellings, silently breaking this
lookup table (a missing key renders as `undefined`, not a caught error, unless the
consumer guards it).
Workaround: none needed yet — no consumer.
Next action: when the `RideService` DB enum (and any `Registration` status enum) is
defined, either match these exact keys or update `terminology.ts` to match — do not let
the two drift apart silently. Ride status (`draft`/`published`/`registration_open`/
`registration_closed`/`started`/`finished`/`cancelled`) and bicycle type
(`road`/`gravel`/`mtb`/`any`) are NOT affected — both already have an authoritative source
in `docs/product.md`.

### KI-020 — shadcn CLI's default alias writes components into `apps/web`, not `packages/ui`

Status: open. Discovered: 2026-09-13 (CR-063).
Problem: `apps/web/components.json` (scaffolded in CR-002) sets `aliases.ui` to
`@/components/ui` — shadcn's own CLI default, which generates vendored components
directly inside `apps/web`. `docs/design.md` §9/§14 requires shared components
(`Button`, `Card`, `MetricTile`, ...) to be vendored into `packages/ui` instead, so both
cabinets consume one copy and `.claude/rules/extensibility.md`'s regression discipline
applies to them.
Impact: none yet — no components are vendored (`packages/ui/src/index.ts` is still
`export {}`). Running `npx shadcn add <component>` as-is today would generate into the
wrong package.
Workaround: none needed until a component is actually vendored.
Next action: CR-065/CR-066 (first shared components) must either point
`components.json` at `packages/ui` (and confirm shadcn's CLI can target a different
workspace package) or vendor manually and re-theme by hand, per docs/design.md §14's
"vendored ... and re-themed to these tokens" framing. Decide before writing the first
component, not after several have already landed in the wrong place.
Update 2026-09-13 (CR-065): still open, but CR-065's four components
(`MetricTile`/`MetricRow`/`StatusBadge`/`DifficultyScale`) did NOT trigger this —
none are shadcn-registry primitives, and `StatusBadge` was deliberately built
self-contained (not composed from a separate generic `Badge`) specifically to avoid
pulling this question into that task's scope. Stays open for whichever CR vendors an
actual shadcn primitive (`Button`, `Card`, `Badge`, ...) into `packages/ui`.
Update 2026-09-13 (CR-066): `Skeleton` _is_ a real shadcn-registry primitive — this
task chose to hand-vendor it directly against `packages/ui`'s own tokens/`cn` instead
of resolving the CLI-targeting question, since the upstream component is trivial (one
`div`, two classes: `animate-pulse rounded-md bg-muted`, re-themed here to
`motion-safe:animate-pulse rounded-md bg-text-muted/15`). This is a reasonable
per-component escape hatch for anything this simple, but does not resolve the general
question — a structurally complex primitive (`Dialog`, `Select`, `DatePicker`, ...)
would be real, error-prone work to hand-roll and should either repoint
`components.json` at `packages/ui` (confirming the CLI can target a non-root workspace
package first) or make a deliberate one-time call to keep hand-vendoring everything.
Still open; next action unchanged until whichever CR needs the first non-trivial
primitive.
Update 2026-09-13 (CR-011): `Button`/`Input`/`Card` are real shadcn-registry
primitives too (unlike CR-065's four) but, like `Skeleton`, structurally trivial
— hand-vendored directly against `packages/ui`'s tokens/`cn` rather than
resolving the CLI-targeting question. `FormField` has no shadcn equivalent
(this project's own composition of label + control + error/hint), so it isn't
relevant to this issue either way. Still open; next action unchanged.

### KI-022 — Auth endpoints ship with an interim, weaker security posture than `.claude/rules/security.md`'s full checklist

Status: open — narrowed, not a regression. Discovered: 2026-09-13 (CR-011).
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

### KI-023 — Profile avatar/photo upload is not implemented

Status: open. Discovered: 2026-09-14 (CR-013). Widened: 2026-09-14 (CR-014,
same gap on a second entity). Widened again: 2026-09-14 (CR-017, a third).
Problem: `docs/design.md` §9 lists `Avatar` in `packages/ui`'s intended
component inventory, and a profile screen conventionally includes a photo, but
CR-013 shipped only text fields (`displayName`/`phone`/`bio`) — deliberately,
not an oversight. Uploading and serving an image needs the S3 pipeline
(`apps/api/src/s3.ts`), which has never been connected to a live object store
in this environment (KI-015) and has no consumer yet. CR-014's
`OrganizerProfile` hit the identical gap (a logo/photo would be the natural
public-facing image) and was scoped out the same way; CR-017's `Ride` table
already has a nullable `coverImageUrl` column (`docs/product.md`'s Ride
fields list "cover image") with no way to set it yet — same gap a third time,
not a new one.
Impact: low — every affected screen is fully usable without a photo; every
other field on each works end to end.
Workaround: none needed — no UI currently expects an avatar/logo/cover image
to exist.
Next action: build alongside CR-086 (cover image pipeline: size/type limits,
resizing, S3-vs-proxy serving) once KI-015 is resolved and that pipeline
exists — reuse it for `User`, `OrganizerProfile`, and `Ride` rather than
building a separate upload path per entity.

### KI-026 — No verify-email web screen exists, and two organizer actions now hard-depend on it

Status: open. Discovered: 2026-09-13 (CR-011, as an accepted scope boundary —
"not a clickable page ... but enough for the live-check/manual QA path via a
direct POST"). Widened: 2026-09-14 (CR-019) — a second organizer action now
gates on the same unreachable-from-the-UI state.
Problem: `docs/design.md` §8 lists `/verify-email` under "Auth flows" with a
note pointing at CR-059/CR-060, but CR-059's UI half was never built — only
`POST /v1/auth/verify-email` (the API call a real screen would make) exists.
An organizer with an unverified email today has no in-app way to complete
verification at all. `POST /v1/organizers/me` (CR-014) already 403s
`email_verification_required` for such a caller; CR-019 (this session) adds
`POST /v1/rides/:id/publish` as a second endpoint with the identical gate —
both now show a correct, worded banner in `apps/web`, but neither can link
anywhere that actually resolves the problem.
Impact: medium and growing — a real organizer who registers, skips the dev-
only `verificationUrl` response field (production never returns it; real
email delivery is ADR-007, still Pending), and later tries to create an
organizer profile or publish a ride hits a dead end with no recovery path in
the UI.
Workaround: manual — call `POST /v1/auth/verify-email` directly (curl/API
client) with the token from `POST /v1/auth/register`'s dev-only
`verificationUrl` field, same as this session's and CR-011's own live checks
already do.
Next action: CR-059's own remaining scope was narrowed to "gate organizer
publish" and is now closed by CR-019 — the actual `/verify-email` screen has
no ticket number of its own in `docs/tasks.md`. Needs one added (same
"real gap, add a ticket" discipline as KI-024/KI-025) before or alongside
ADR-007's real email delivery, since a screen with no email pointing at it is
only marginally more useful than today's curl workaround.

### KI-034 — `routes.distanceKm`/`elevationGainMeters` (GPX-computed) and `rides.distanceKm`/`elevationGainMeters` (organizer-entered) are not reconciled

Status: resolved 2026-09-15 (CR-029, "Route metadata" — its own named "next
action"). Discovered: 2026-09-15 (CR-027, "GPX upload" session).
Problem: `PATCH /v1/rides/:id` (CR-018) lets an organizer manually enter
`distanceKm`/`elevationGainMeters` on the `Ride` row itself. CR-027 adds a
second, independent computation of the same two figures on the new `Route`
row, derived from the actual uploaded GPX track (haversine distance sum,
positive-elevation-delta sum). Neither writes to the other — an organizer who
uploads a GPX after already entering manual figures (or vice versa) can end
up with two different numbers for the same ride, shown in different places
(`EditRideForm`'s fields vs. `RouteUploadForm`'s summary card).
Impact: low today — `/rides/[id]` (ride detail) still only reads `Ride`'s own
fields (CR-023 predates `Route`), so a viewer never sees both numbers side by
side yet; the mismatch is only visible to the organizer across two screens.
Will matter more once a ride-detail screen shows route data too (CR-028/029).
Workaround: none needed — both figures are individually correct for what
they measure (one is the organizer's stated summary, the other is the GPX's
actual measurement); nothing currently conflates them.
Resolution: `POST /v1/rides/:id/route` (first upload only) now auto-fills
whichever of `Ride.distanceKm`/`elevationGainMeters` is still `null` from
the parsed GPX, in the same DB transaction as the route insert — this
resolves the common case (most rides never accumulate two numbers at all).
For the remaining edge case (an organizer's already-entered figure that
turns out to differ from the track), the organizer's own route screen
(`RouteUploadForm`) shows both values with an explicit "Использовать данные
трека" action that reuses the existing `PATCH /v1/rides/:id` (no new
endpoint) — a deliberate opt-in, never a silent overwrite.
`PATCH .../route` (replace) still never touches `Ride`'s fields, so
replacing a track with a very different one cannot silently change numbers
the organizer already relied on. Live-verified against a real Postgres +
browser: a failed upload (S3 unreachable, KI-015) leaves `Ride`'s fields
untouched; a manually created mismatch shows the note with both values; the
sync action updates `Ride` to match and the note disappears.

### KI-035 — No live 2GIS/route-rendering read of `Route.geometry` yet; only a summary is exposed

Status: resolved 2026-09-15 (CR-028, "Route rendering" — the "next action" this
entry itself named). Discovered: 2026-09-15 (CR-027, "GPX upload" session).
Problem: `GET /v1/rides/:id`'s additive `route` field is a summary only
(`RouteSummary` — id/fileName/size/distance/elevation/pointCount), not the
full `geometry` polyline (`.claude/context/current-task.md`'s CR-027 scoping
note: no consumer for the full point array exists yet, and shipping it on
every ride-detail response would needlessly bloat the payload).
Resolution: new `GET /v1/rides/:id/route/geometry` endpoint (`{ points:
RouteGeometryPoint[] }`), a separate, opt-in fetch only `/rides/[id]`'s route
section makes — same viewer-visibility rule as `GET /v1/rides/:id`/`.../
route/download`, no S3 call (`Route.geometry` is already in the DB row).
Live-verified against a real Postgres: owner sees a draft ride's geometry, a
stranger gets `404 ride_not_found` for the same draft ride, and any viewer
(including no session) sees it once published — cross-checked byte-for-byte
against the inserted `routes.geometry` value.

---

## Resolved

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

Status: open — widened 2026-09-15 (CR-028, "Route rendering"): `/rides/[id]`'s new
route map section hits the identical gap, same reasoning, second surface.
Discovered: 2026-09-15 (CR-026, "Map discovery" session).
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
Next action: once a real `MAPS_2GIS_MAPGL_KEY`/`NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`
pair exists, build the actual render layer `.claude/rules/maps.md` describes
(a `packages/maps-core` render-layer type + a `packages/maps-2gis`
implementation loading the real MapGL script) and wire markers from each
ride's `startLat`/`startLng` (discovery) and `Route.geometry` (ride detail —
both placeholders need replacing, not just the first one built). Blocked on
KI-016 (same missing credential).

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
