# Known Issues

Blockers, unresolved bugs, external integration limitations, and technical debt that must
survive between Claude Code sessions.

Each issue: ID; status; discovered date; problem; impact; workaround; next action.

## Archiving (keep this file cheap to read)

This file tracks active risk. Once an issue is resolved, move its entry verbatim into
`.claude/context/known-issues-archive.md` (preserving content exactly, same discipline as
`docs/changelog.md`'s own archive) instead of leaving it here under a growing "Resolved"
section — the resolution's _why_ belongs in `docs/changelog.md`'s CR entry anyway. Do this
as part of closing the issue, not as a periodic batch cleanup.

---

## Open

### KI-066 — Organizer registration activity is aggregated client-side from per-ride requests

- Status: open (accepted limitation), discovered 2026-09-26 (CR-130).
- Problem: `/organizer`'s «Новые записи»/«Записи по дням» widget
  (`features/organizer/activity/`) has no aggregate endpoint to read, so it
  calls `GET /v1/rides/mine` and then `GET /v1/rides/:id/participants` once
  per selected ride (≤10 rides, ≤3 pages each), aggregating in the browser.
  CR-130's scope was frontend-only, so no new API surface was added.
- Impact: up to ~11 requests per dashboard load for a busy organizer; rides
  beyond the 10 soonest in the window are not counted; an organizer with
  more than 100 rides only sees the newest 100 considered.
- Workaround: none needed at current scale.
- Update 2026-09-26 (CR-131): the overview widget adds its own reads on the
  same page (`/organizers/me`, `/rides/mine/summary`, `/rides/mine` again and
  the nearest ride's participants) — the dashboard now makes roughly
  `4 + selected rides` requests. Same fix applies.
- Next action: if organizers with many concurrent rides appear, add a
  `GET /v1/rides/mine/registrations/activity` aggregate (sibling of
  `/mine/summary`, CR-103) and point the widget at it.

### KI-065 — `participantsVisible` can't be changed after publish

Status: open. Discovered 2026-09-24 (CR-125).
Problem: `Ride.participantsVisible` (the organizer's riders-list privacy toggle) is
only settable via `PATCH /v1/rides/:id`, which is draft-only
(`resolveOwnDraftRide`/`409 ride_not_editable`) — the same gate every other ride
setting in this codebase already uses (`participantLimit`, cover image, route, ...).
An organizer who wants to hide/show the list on an already-published ride currently
cannot.
Impact: minor UX limitation, not a data-safety issue — the setting still defaults to
`true` (today's live behavior) and works correctly at creation time.
Workaround: decide the setting before publishing.
Next action: none planned. If this becomes a real complaint, it needs a small
dedicated endpoint (or a relaxation of the draft-only rule for this one field) — a
deliberate product decision, not a bug fix, since draft-only editing is consistent
project-wide.

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
Update 2026-09-20 (CR-097): a real `PutObject`/`GetObject`/`DeleteObject`
round trip was exercised end to end this session, through `lib/
image-storage.ts` (the module `route-storage.ts`'s cover-image/avatar
siblings share, relocated from `cover-image-storage.ts` — see
`docs/changelog.md`), via a live avatar upload/download/delete against the
real `coffee-ride` MinIO bucket (confirmed with `mc find` before and after).
This proves the S3 client/credential/bucket path genuinely works, but
`route-storage.ts`'s own GPX-specific code path is still, narrowly,
unexercised — leaving this open rather than resolving it outright.
Update 2026-09-24: owner hit «Загрузка недоступна» on avatar upload — Docker
Desktop was off, so MinIO was down (`/health` → `s3: "error"`); the degraded
UI state behaved as designed. Fixed by starting Docker + `docker compose up
-d minio` + `mc mb --ignore-existing local/coffee-ride`; a live avatar
upload/download/delete then returned 201/200/204. Still nothing auto-creates
the bucket — a `minio-init` compose service would remove that manual step.
Update 2026-09-24 (CR-129): done — `docker-compose.yml`'s one-shot
`minio-init` creates the bucket (`mc mb --ignore-existing`) once `minio` is
healthy; verified on a fresh isolated volume (bucket created, exit 0, re-run
exit 0). What keeps this open is only `route-storage.ts`'s GPX path above.

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

### KI-026 — No verify-email web screen exists, and two organizer actions now hard-depend on it

Status: narrowed 2026-09-20 (CR-099). Discovered: 2026-09-13 (CR-011, as an accepted scope boundary —
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
Update 2026-09-20 (CR-099, a user-run QA pass against a live browser): the
real `/verify-email` page now exists (`app/verify-email/page.tsx` +
`features/auth/verify-email`), reads `?token=` and calls `POST /v1/auth/
verify-email` on mount. The register success screen's dev-only note was
itself misleading before this — it rendered the raw API path
(`/v1/auth/verify-email?token=...`, a POST-only route) as if it were a
clickable link, which 404'd when followed; it now links to the real
`/verify-email?token=...` web page instead. Live-verified end to end in a
real browser against the real running stack: register → click the rendered
link → "Email подтверждён". This closes the dev/QA-path half of this issue.
Still narrowed, not fully resolved: in production, `verificationUrl` is
never returned (ADR-007's real email delivery is still Pending), so a real
organizer still has no way to ever reach this screen with a valid token —
the screen existing doesn't by itself close that half. Next action unchanged
until ADR-007 lands.
Update 2026-09-20 (CR-100, ADR-007 now Accepted): real email delivery now
exists — `POST /v1/auth/register` sends (or enqueues) a verification email
via Unisender Go alongside the unchanged dev-only `verificationUrl` field.
Still not fully resolved, for two independent reasons: (1) the user hasn't
yet configured `EMAIL_FROM_ADDRESS` (no sender is verified in their
Unisender Go account) — until then `app.emailProvider` stays `null` and the
producer silently no-ops, unchanged from before this session; (2)
`unisender.ru`/`go1.unisender.ru` fail DNS resolution (`SERVFAIL`) from
inside this sandbox specifically (confirmed via `nslookup` — not a blanket
`.ru` block, `ya.ru` resolves fine) — a real send has never actually been
exercised live, only against mocked `fetch` in `unisender-provider.test.ts`.
Next action: user sets `EMAIL_FROM_ADDRESS` to a real verified sender, then
the first session with real network access to `unisender.ru` should send
one real email end to end (register → check inbox → click link) before
this is trusted as more than "the adapter's request shape is correct."

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

Status: narrowed 2026-09-20 (CR-099). Discovered: 2026-09-17 (CR-060, "Password reset flow").
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
Update 2026-09-20 (CR-099, a user-run QA pass against a live browser): both
`/forgot-password` and `/reset-password` screens now exist (`app/
forgot-password/page.tsx`, `app/reset-password/page.tsx` +
`features/auth/{forgot-password,reset-password}`). Live-verified
`/forgot-password` end to end against the real running stack (generic
success state shown regardless of account existence, per
`.claude/rules/security.md`); `/reset-password`'s missing-token state
live-verified, its token-present path covered by
`reset-password.test.tsx` against the same three server error codes
(`invalid_reset_token`/`reset_token_already_used`/`reset_token_expired`)
`auth.routes.test.ts` already exercises server-side (no dev-only token
field exists to fetch one through a real browser — by design, unchanged).
Still narrowed, not fully resolved: this closes the "no screens" half only
— "the reset token is never exposed over HTTP, even in dev" is unchanged
and deliberately so, and a real user still cannot discover their own token
without ADR-007's real email delivery landing. Next action unchanged.
Update 2026-09-20 (CR-100, ADR-007 now Accepted): `POST /v1/auth/
forgot-password` now sends (or enqueues) a real reset email via Unisender
Go when the account exists — the route's response stays byte-identical
`204` either way, so this adds no enumeration surface. Same two open
reasons as KI-026's identical update: no `EMAIL_FROM_ADDRESS` configured
yet (`app.emailProvider` stays `null`, producer no-ops), and this sandbox
can't resolve `unisender.ru` (`nslookup` confirms `SERVFAIL`) to exercise a
real send. Next action: same as KI-026's — configure a verified sender,
then verify one real send from an environment with real network access.

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

### KI-051 — Native dev `DATABASE_URL` database was missing CR-097's migration, 500ing every ride read

Status: resolved same session, 2026-09-20 (CR-098 session). Discovered:
2026-09-20 (CR-098 session), while starting local dev servers to live-verify
the discovery map.
Problem: `GET /v1/rides` 500'd with a `DrizzleQueryError`: `column
organizer_profiles.avatar_key does not exist`. CR-097 (prior session) added
that column via migration `0016_avatar_columns.sql` and validated against
`TEST_DATABASE_URL` (Docker Compose Postgres) — its own live end-to-end
verification apparently also went through a different Postgres than this
session's `.env`-configured native `DATABASE_URL` (`coffee_ride_dev`, the
same native Homebrew Postgres KI-049 already documents as distinct from
Docker's, both on port 5432 under different address families), which never
had migration `0016` applied.
Impact: high for this session's immediate task (blocked live-verifying any
ride-listing endpoint, including the new discovery map) — zero for CI/tests
(both go through `TEST_DATABASE_URL`, already migrated) and zero for actual
avatar functionality (CR-097's own feature code is correct; only this one
native database's applied-migrations state was stale).
Workaround: none needed — see Resolution.
Resolution: ran `pnpm --filter db db:migrate` with `DATABASE_URL` sourced
from `.env`, applying the pending migration to `coffee_ride_dev` directly.
`GET /v1/rides` confirmed working immediately after (`{"items":[],
"nextCursor":null}`, no error). No data loss — an ordinary additive
migration, not the KI-049 incident's destructive `DELETE FROM` pattern.
Next action: none for this specific occurrence. Worth remembering: this
native database needs its own `pnpm --filter db db:migrate` run after any
session that adds a migration but only validated/live-verified against
`TEST_DATABASE_URL` — the same two-Postgres-instances setup KI-049 already
flagged, one more concrete consequence of it.

### KI-055 — `unisender.ru` (all subdomains) fails DNS resolution from this sandbox

Status: open. Discovered: 2026-09-20 (CR-100, ADR-007 session).
Problem: `nslookup go1.unisender.ru`/`go2.unisender.ru` both return
`SERVFAIL` from this sandbox's resolver — not a blanket `.ru` TLD block
(`nslookup ya.ru` resolves normally to real addresses), specific to this
one vendor's domain. `WebFetch` against `godocs.unisender.ru` (API docs)
failed identically (`ENOTFOUND`) earlier the same session, before any code
existed to blame — confirming this is a standing environment/network
constraint, not a bug in `lib/email/unisender-provider.ts`.
Impact: medium — blocks live end-to-end verification of the real Unisender
Go integration (CR-100) in this specific sandbox. Zero impact on
correctness confidence otherwise: the adapter's request shape was verified
against the real `django-anymail` Unisender Go backend source (not
guessed), and `unisender-provider.test.ts` exercises its parsing/error-
normalization logic against mocked `fetch` responses matching that verified
shape.
Workaround: none needed for development — the adapter degrades identically
whether Unisender is unconfigured (`app.emailProvider === null`) or
configured-but-unreachable-from-here; either way every producer no-ops
without throwing (`.claude/rules/resilience.md`).
Next action: the first session with real network access to `unisender.ru`
(the user's own machine, CI, or production) should send one real
verification/reset email end to end (register or forgot-password → check a
real inbox → click the link) once `EMAIL_FROM_ADDRESS` is configured to a
sender verified in the Unisender Go account — see KI-026/KI-042's matching
"Next action."

### KI-056 — 2GIS REST APIs (Routing/Geocoder) unreachable from this machine's current egress

Status: open. Discovered: 2026-09-23 (while seeding a dev route after CR-112).
Problem: `routing.api.2gis.com`/`catalog.api.2gis.com` resolve (to
`91.236.49.x`) but every TCP connect to :443 times out, sandbox on or off.
MapGL tiles/JS (`mapgl.2gis.com`, a different subnet) load fine, so maps
render but nothing server-side can call 2GIS. Egress country reported as
`FR` — the machine is routed through a VPN; 2GIS's API edge appears not to
accept that path.
Impact: high for any route-building work — `MapProvider.getRoute`/`geocode`
cannot be exercised live. A dev route seeded as a stand-in was built from
OSM (OSRM bike profile), not 2GIS; an earlier version of that seed thinned
the line to one point per 120 m and visibly cut across the Moskva river —
fixed by re-seeding at full resolution, but it's still OSM data, not 2GIS.
Workaround: turn the VPN off (or split-tunnel `*.2gis.com`) before any
session that needs the 2GIS REST APIs.
Next action: with 2GIS reachable, rebuild the "Тестовый заезд на выходные"
seed route through `create2GisMapProvider().getRoute({ profile: 'cycling' })`.
Update 2026-09-23 (CR-114): the route builder is implemented against mocked
2GIS responses only. Also verify live: that `need_altitudes: true` yields a Z
coordinate in `outcoming_path.geometry[].selection` (otherwise built routes have
no elevation profile), and what 2GIS returns for an unroutable pair of points
(the adapter maps 204 / empty result / no geometry to `no_route` → 422).

### KI-057 — The 2GIS basemap stays light in the dark theme

Status: open. Discovered: 2026-09-23 (CR-118/CR-119 review).
Problem: the «Топокарта» dark theme (ADR-021) re-colours every app surface, but
both MapGL maps (`DiscoveryMap`, `RouteMap`, `RouteBuilder`) keep 2GIS's default
light basemap style. Marker halos and the route casing resolve from the dark
theme's tokens (`--route-casing`), so on the light tiles they read as dark
outlines instead of the intended "paper" halo.
Impact: low-medium — cosmetic, nothing breaks, but the largest surface on
discovery and ride detail ignores the theme.
Workaround: none needed; the maps stay legible.
Next action: pick a 2GIS MapGL dark style (style id from the 2GIS account's
style editor), pass it through `MapRenderOptions` as an additive provider-neutral
option (e.g. a `theme: 'light' | 'dark'`, mapped to a style id inside
`packages/maps-2gis`), switch it when the theme changes, and re-check the halo
colours on both basemaps. Next task after KI-064.

### KI-058 — `routePreview` samples each ride's full stored geometry on every list request

Status: open. Discovered: 2026-09-23 (CR-116).
Problem: `GET /v1/rides` builds each item's `routePreview` at request time —
`rides.service.ts`'s batched list extras sample every ride's full
`routes.geometry` in SQL, then `modules/rides/route-preview.ts` runs
Douglas–Peucker over the sample. The full geometry never leaves Postgres, but
Postgres still expands it for every ride on every page of every discovery
request.
Impact: low today (few rides, short routes); grows with route length × page size
× discovery traffic.
Workaround: none needed at current scale.
Next action: if the list query becomes hot, compute the preview once at route
write time (GPX upload/replace and `POST /v1/rides/:id/route/build`) into a
stored column and read that instead — the response contract stays unchanged.

### KI-060 — Discovery's «Старт: …» only knows the start route-point label

Status: open. Discovered: 2026-09-23 (CR-118…CR-120 main-session review).
Problem: `PublicRideListItem.startLabel` carries only the start route point's
`label`. When an organizer labels it just «Старт», `formatStartPlace` hides the
line on the discovery list (to avoid «Старт: Старт»), while ride detail falls
back to the point's description — so the list shows no start place for such
rides.
Impact: low — the ride's map pin still shows where it starts.
Workaround: organizers can name the start point by place («Парк Горького»).
Next action: send the start point's description too (additive field) or add a
dedicated start-place field on `Ride`, and use the same fallback on both screens.

### KI-061 — Organizer ride sub-page links are a hard-coded list, not a registry

Status: open. Discovered: 2026-09-23 (CR-120).
Problem: `EditRideForm` links to the ride's sub-pages (Маршрут, Обложка,
Группы, Участники, Обновления) as a plain hand-written link list; CR-120 added
«Группы» as one more entry. `.claude/rules/extensibility.md` ("Registration over
branching") asks for a descriptor registry on shared surfaces that every feature
extends.
Impact: low now (five links); each new ride sub-feature edits a shared form
component, which is the coupling ADR-009 exists to prevent.
Workaround: none needed.
Next action: when the next ride sub-page is added, move these links into a
small descriptor registry (label, href builder, order, optional flag), the same
pattern as the cabinet nav/widget registries.

### KI-062 — Group pace: the client requires 0.5 km/h steps, the API only checks 5–60

Status: open. Discovered: 2026-09-23 (CR-120).
Problem: `features/organizer/groups/validation.ts` enforces a 0.5 km/h step,
but the API's `groupPaceSchema` (`packages/types/src/api/ride-groups.ts`) and the
DB (`numeric(4,1)`, CHECK 5–60) accept any one-decimal value, e.g. 27.3.
Impact: very low — only a direct API call can store a non-0.5 pace; it is still
valid data.
Workaround: none needed.
Next action: decide whether 0.5 is a real rule; if so, add it to the shared Zod
schema (one source for client and server), otherwise drop the client-only step.

### KI-063 — Local MinIO/S3 container is stopped; uploads are unavailable in local dev

Status: open. Discovered: 2026-09-23 (CR-115…CR-120 verification).
Problem: in the current local stack `GET /health` reports `s3: "error"`
(db/redis `ok`) — the MinIO container is not running.
Impact: GPX upload/download, cover images and avatars fail locally with the
documented "upload unavailable" degraded state; nothing else is affected.
Workaround: `docker compose up -d minio` before any session that needs uploads.
Next action: start MinIO and re-check `/health`; close this entry once it
reports `s3: "ok"` again.

### KI-064 — Critique P0: `/login` has no `?next=`, so an anonymous «Зарегистрироваться» loses the ride

Status: open. Discovered: 2026-09-23 (P0 of the `/impeccable critique apps/web`
run, 21/40, that led to CR-115); still open after CR-115…CR-120.
Problem: on `/rides/[id]` an anonymous visitor's «Зарегистрироваться»
(`RegistrationButton`'s `router.push('/login')` on 401) and the «Участники»
sign-in link (`RidersSection`, a plain `href="/login"`) send them to `/login`
without any return target; after signing in they do not come back to the ride they wanted to join.
Impact: high for the core participant journey (discover → register) — the
registration intent is dropped at the one point the product most needs it.
Workaround: the visitor navigates back to the ride by hand.
Next action: next logical task — pass a validated same-origin relative `next`
path to `/login` (and on to `/register`), redirect there after a successful
sign-in, and reject absolute/external URLs (open-redirect protection).

## Resolved

Moved to `.claude/context/known-issues-archive.md` (37 entries) on 2026-09-20, per this
file's own Archiving rule — this section had grown to ~1050 lines of closed issues.
