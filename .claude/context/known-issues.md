# Known Issues

Blockers, unresolved bugs, external integration limitations, and technical debt that must
survive between Claude Code sessions.

Each issue: ID; status; discovered date; problem; impact; workaround; next action.

---

## Open

### KI-001 — No deployment artifacts exist

Status: narrowed 2026-09-17 (CR-074). Discovered: 2026-09-11 (pre-foundation audit).
Problem: no `Dockerfile`, no `.dockerignore`, no production manifest, no reverse proxy
config. `docker-compose.yml` is local development infrastructure only and says so.
CR-074 added `apps/web/Dockerfile`, `apps/api/Dockerfile`, and a root `.dockerignore`
(multi-stage, non-root runtime user, Next.js `output: 'standalone'` for `apps/web`,
ADR-017's esbuild bundle pruned to a production-only `node_modules` via `pnpm deploy`
for `apps/api`) — see `docs/changelog.md` for the full mechanics. Still missing: a
production manifest and reverse proxy config putting both images behind one origin
(ADR-013) — that stays CR-075.
Impact: the project still cannot be deployed to a server end to end, but the two
application images themselves are no longer the missing piece.
Workaround: none needed for CR-075 — the images exist now.
Next action: CR-075. (Neither new Dockerfile has had an actual `docker build` run
against it yet — see KI-019, same root cause, same environment.)

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
Update 2026-09-19: Docker worked this session; `docker compose up -d minio`
started cleanly, but the `coffee-ride` bucket did not exist yet (fresh
container/volume) — `apps/api`'s `/health` reported `s3: "error"` until it was
created manually (`mc mb local/coffee-ride`), after which `/health` reported
`s3: "ok"`. Note for next time: nothing in this repo auto-creates the bucket
on first boot — a fresh `minio_data` volume needs this one-time `mc mb` step.
Health-check-level connectivity is now confirmed; a real
`PutObject`/`GetObject`/`DeleteObject` round trip through
`route-storage.ts` itself (e.g. an actual GPX upload) was not exercised this
session — that remains the next action.

### KI-017 — `packages/maps-2gis`/`packages/db`/`packages/types` export raw TS source, not compiled `dist`

Status: resolved 2026-09-17 (ADR-017, `docs/decisions.md`). Discovered:
2026-09-12 (CR-007). Confirmed live-blocking: 2026-09-13 (CR-011).
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
Workaround: none for production (until resolved below). `apps/api`'s actual
CR-011 acceptance criteria (dev-mode live check via `tsx`, all four `vitest`
suites, `tsc` typecheck/build) were unaffected — none of them execute
`dist/server.js` under plain `node`.
Resolution: ADR-017 — `apps/api`'s own `build` script now bundles
`src/server.ts` plus `db`/`types`/`resilience`'s source into one
`dist/server.js` via `esbuild` (`apps/api/scripts/build.mjs`) — a bundler,
chosen over declaration-based `dist` exports specifically to avoid adding
dev/test-path complexity to packages that already work correctly for every
consumer (full reasoning in ADR-017 itself). Every real npm dependency stays external, resolved from
`node_modules` at runtime as before — never bundling a native addon
(`argon2`) mattered, not just avoiding unnecessary work. `db`/`types`/
`maps-core`/`maps-2gis`/`resilience` themselves are completely untouched.
Live-verified, not just built without error: `NODE_ENV=test node
dist/server.js` against this environment's real local Postgres booted
cleanly (previously crashed with the exact `ERR_MODULE_NOT_FOUND` above),
`GET /health` responded, and a real `POST /v1/auth/register` round-tripped
through the bundle (argon2 hash, Drizzle insert, helmet headers, rate
limiting) with `201 Created`. Separately confirmed the unrelated,
already-correct production placeholder guard (CR-073) still fires under a
real `NODE_ENV=production` with this environment's local-only config — the
two are orthogonal, and conflating them would have made the wrong test look
like a pass. Found and fixed one more real gap along the way: marking
`postgres` external in the bundle wasn't sufficient by itself under pnpm's
strict `node_modules` (a package's own dependencies aren't visible to a
workspace consumer that doesn't declare them directly) — `apps/api/
package.json` now lists `postgres` as a direct dependency, documented in
`build.mjs`'s own comment so a future similar gap is recognized, not
re-debugged from scratch. Full `apps/api` test suite (283 tests) and
`pnpm turbo run lint typecheck build` (24/24) confirmed zero effect on the
dev/test paths.
Next action: none for this gap. CR-074 (Dockerfile) can now proceed —
`pnpm --filter api build && node dist/server.js` is a real, working
production boot to build a Docker image around. If a future workspace
package needs bundling into `apps/api`'s production artifact too, see
ADR-017's "When to revisit."

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

### KI-036 — Route points have no participant-facing UI yet (organizer management + API only)

Status: open. Discovered: 2026-09-15 (CR-031, "Route points" session).
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

### KI-038 — `next build` crashes if a `development`-valued `NODE_ENV` reaches it from the shell

Status: open (documented workaround, no code fix needed). Discovered: 2026-09-15
(CR-036, "Waitlist" session, while running the full `turbo run ... build` validation
pass).
Problem: this project's root `.env` sets `NODE_ENV=development` (needed for
`apps/api`'s dev server / `packages/db` migrations to run in dev mode). Sourcing that
file into the shell (`set -a && source .env && set +a`, the pattern this and prior
sessions use to get `DATABASE_URL`/etc. into `pnpm`/`turbo` commands) and then running
`next build` in the same shell makes `apps/web`'s production build crash during static
export: `Error: <Html> should not be imported outside of pages/_document`, on both
`/404` and `/_error`. Confirmed via `git stash` that this reproduces identically
against `main` at the last commit before this session's changes — a pre-existing
environment/tooling interaction, not a regression this or any other CR introduced.
Root cause: Next.js only forces `NODE_ENV=production` for `next build` when the
variable isn't already set; an explicitly inherited `development` value survives and
changes internal prerendering behavior for the auto-generated `/404`/`/_error` pages
(the pages-router-style error/document code path), which the app-router-only, no
`pages/` directory setup in `apps/web` doesn't otherwise exercise. Not caused by a
stale `.next`/`.turbo`/`node_modules/.cache` — clearing all three and retrying still
failed under an inherited `NODE_ENV=development`; passed immediately once `NODE_ENV`
was overridden to `production` for that one command.
Impact: medium — any session that sources the root `.env` for other reasons (DB
migrations, `apps/api` env vars) and then runs `turbo run build` or `pnpm --filter web
build` in the _same_ shell will see a spurious `web:build` failure that looks
code-related but isn't.
Workaround: run `apps/web`'s build with `NODE_ENV=production` explicitly overriding
whatever the shell inherited, e.g. `NODE_ENV=production pnpm --filter web build`, or
export the other needed variables (`DATABASE_URL` etc.) individually instead of
sourcing the whole `.env` file before a build. `turbo run build` alone (without first
sourcing `.env` into the same shell) does not hit this either, since nothing sets
`NODE_ENV` for it in that case.
Next action: none required — this is a shell/invocation-order gotcha, not a bug in
`apps/web`'s own code or config. Worth remembering for any future session's validation
pass: don't reuse a `source .env`'d shell for both `apps/api` DB work and `apps/web`
builds without overriding `NODE_ENV` for the latter.

### KI-042 — No `/forgot-password`/`/reset-password` web screens; the reset token is never exposed over HTTP, even in dev

Status: open. Discovered: 2026-09-17 (CR-060, "Password reset flow").
Problem: `docs/design.md`'s Auth-flows row names `/forgot-password`/
`/reset-password` but no CR before this one built either the API or the
screens — same gap shape as KI-026 (`/verify-email`). CR-060 shipped the API
mechanics only (`POST /v1/auth/forgot-password`, `POST
/v1/auth/reset-password`). Unlike `/verify-email` (whose `register` response
carries a dev-only `verificationUrl`), this endpoint's response must stay
byte-identical whether or not the email exists
(`.claude/rules/security.md` — no account enumeration), so no dev-only token
field exists anywhere on `forgot-password`, in any environment. A real
organizer/participant who forgets their password today has no way to
actually complete a reset without a real email-delivery channel (ADR-007,
still Pending).
Impact: medium — password reset is unusable end to end for a real user in
this environment (no email delivery, no web screen), though the underlying
mechanics (issue/validate/consume token, revoke sessions) are fully built and
tested.
Workaround: manual/test-only — call `requestPasswordReset(db, email)`
directly from the service layer (as `auth.routes.test.ts` does) to obtain
the raw token, then `POST /v1/auth/reset-password` with it via curl/API
client. No production-safe workaround exists, by design.
Next action: needs its own ticket (same "real gap, add a ticket" discipline
as KI-024/KI-025/KI-026) for the `/forgot-password`/`/reset-password` web
screens, and depends on ADR-007's real email delivery landing before a real
user could ever discover their own reset token — a web screen alone doesn't
close this gap without a delivery channel behind it.

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
Next action: the first session with a working Docker daemon should run
`docker build -f apps/web/Dockerfile .` and `docker build -f apps/api/Dockerfile .`
from the repo root, then `docker run` each with real env vars and confirm
`apps/web` serves its pages and `apps/api`'s `/health` responds, before this is
trusted as a real, deployable artifact (not just "the Dockerfile parses").

### KI-044 — `apps/api`'s rate limiter may see one internal IP for every request once deployed behind Caddy

Status: open. Discovered: 2026-09-17 (CR-075, ADR-018).
Problem: `docker-compose.prod.yml`'s topology is `Caddy → web → (Next.js rewrite,
server-side) → api` — `api` is never hit directly by Caddy or the public internet,
only by `web` as an internal peer. `apps/api`'s per-IP rate limiter
(`@fastify/rate-limit`, already flagged in-memory-only/single-instance by
KI-014/KI-022) has no `trustProxy` configured on its Fastify instance
(`apps/api/src/app.ts`) — deliberately left alone since `api` has no direct proxy
boundary of its own yet. Whether Next's own `/api/v1/*` `rewrites()` forwards the
original client's `X-Forwarded-For` header through to `api` (Caddy sets it when
proxying to `web`; whether `web`'s own outbound rewrite request preserves it is a
separate, unverified question) was not checked either way.
Impact: unknown until checked — if the header isn't forwarded, every request
`api` sees in production would appear to originate from `web`'s single internal
IP, making the per-IP rate limiter effectively a single shared bucket across every
real client at once (both over- and under-limiting incorrectly, not just a minor
inaccuracy).
Workaround: none — not yet checked, so not yet fixed.
Next action: belongs with CR-058 (Redis-backed, per-account auth rate limiting,
currently blocked on KI-014) since that ticket already touches this rate limiter —
verify whether `X-Forwarded-For` survives Next's rewrite hop (inspect the header
`api` actually receives, e.g. via a temporary log line, under a real Caddy→web→api
chain once Docker is available), and if not, either configure `apps/api`'s
`trustProxy` against `web`'s known internal address plus forward the header
through the rewrite explicitly, or move rate limiting in front of `web` instead.

### KI-045 — CR-075/CR-076's Caddy/compose production manifest has never been run end to end

Status: open. Discovered: 2026-09-17 (CR-075, ADR-018; extended CR-076).
Problem: same root cause as KI-019/KI-043 — Docker's daemon is unreachable in this
environment. `docker-compose.prod.yml`, `deploy/Caddyfile`, and (CR-076)
`packages/db/Dockerfile` + the `migrate` service have not had an actual `docker
build`/`docker compose up`/`docker compose run` executed against them, and Caddy's
automatic ACME/TLS additionally needs a real public DNS record pointing at a real
host — something no local or CI sandbox could ever satisfy, Docker daemon or not.
Impact: medium — the compose file's structure (services, env interpolation,
volumes, no published ports on `web`/`api`, the `migrate` profile correctly
absent from a profile-less `docker compose config --services`) was validated with
`docker compose -f docker-compose.prod.yml config`, which catches YAML/
interpolation mistakes but not runtime behavior (container startup order actually
working, Caddy successfully obtaining a certificate, `web` actually reaching `api`
by service name, the `migrate` image actually building). `deploy/Caddyfile` itself
was only reviewed by hand against Caddy's documented syntax — no `caddy validate`
was run (no local `caddy` binary either). CR-076's `packages/db/Dockerfile` got an
extra layer of confidence beyond that: its exact planned file set (workspace
`package.json`s + `packages/db/src` + `packages/db/migrations`, nothing else) was
reproduced by hand in a plain directory (no Docker) and `pnpm --filter db
db:migrate` was run from it against a real throwaway database, successfully — the
closest a real `docker build` can be approximated without one.
Workaround: none needed pre-deploy — this is inherent to the environment, not a
defect to work around.
Next action: the first actual deployment (a real host, real DNS pointed at it)
should run `docker compose -f docker-compose.prod.yml up -d --build`, confirm all
three long-running containers report running/healthy, confirm Caddy actually
obtains a certificate (check its logs, not just that the container started),
confirm `https://$DOMAIN` serves `apps/web` with `/api/v1/*` correctly reaching
`apps/api` end to end, and separately run `docker compose -f docker-compose.
prod.yml --profile migrate run --rm migrate` to confirm the migration image
actually builds and applies cleanly — before trusting this manifest as more than
"the YAML parses."

## Resolved

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
