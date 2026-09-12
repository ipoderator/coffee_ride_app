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

### KI-004 — MinIO healthcheck likely never turns green

Status: open (unverified). Discovered: 2026-09-11.
Problem: the healthcheck shells out to `curl`, which current `minio/minio` images do not
ship; MinIO documents `mc ready local` instead.
Impact: the container may sit `unhealthy` forever, making the signal useless.
Next action: verify with `docker compose ps`, then fix alongside CR-077/CR-082.

### KI-005 — `minio/minio:latest` is unpinned

Status: open. Discovered: 2026-09-11.
Impact: development and server environments drift apart silently.
Next action: CR-082.

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

### KI-012 — Pre-commit ESLint does not cover `apps/*`/`packages/*` staged files

Status: open, accepted for now. Discovered: 2026-09-12 (CR-002).
Problem: ESLint's flat config has no automatic directory cascading — one config
file wins per invocation, chosen by the process's working directory (verified
empirically while wiring `apps/web`'s own `eslint.config.mjs`), not by the linted
file's own location. `turbo lint` runs each workspace's `lint` script with CWD
inside that package, so it correctly picks up that package's own config. But
lint-staged's pre-commit `eslint --fix` runs with CWD at the repo root, so it
always uses the root config — which now deliberately ignores `apps/**`/
`packages/**` (so it doesn't wrongly lint Next/JSX files with the bare root
rules; see `eslint.config.mjs`'s comment). Net effect: staged `apps/*`/
`packages/*` files are not ESLint-checked at commit time (only Prettier, via the
broader lint-staged glob, still runs on them).
Impact: a commit can introduce an ESLint violation in `apps/web` (or any future
package) that only surfaces later, in CI's `turbo lint`/`pnpm lint` — not blocked
at commit time the way root-level file violations are.
Workaround: none needed for correctness (CI still catches it before merge); this
is a coverage gap in the fast local feedback loop, not a broken check.
Next action: CR-010 ("Configure CI + Git hooks") — make lint-staged
workspace-aware (e.g. group staged files by workspace and invoke each package's
own `eslint` from its own directory) rather than a single flat `eslint --fix`.

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

Status: open. Discovered: 2026-09-12 (CR-006).
Problem: same root cause as KI-014 — Docker's daemon did not come up in this
environment (confirmed a third time across CR-004/CR-005/CR-006; recorded as a
standing environment constraint, not re-litigated per task — see
`docker-desktop-unavailable` in Claude's project memory). `src/s3.ts`
(`createS3Client`) was only typechecked/linted/built, never actually connected
to a running MinIO.
Impact: low — thin wrapper around `@aws-sdk/client-s3`'s constructor, not
consumed by any running code path yet (first real use is CR-027 GPX upload or
CR-086's cover image pipeline).
Workaround: none needed yet — nothing calls this code.
Next action: verify a real connection (e.g. `docker compose up minio` + a
`PutObject`/`GetObject` round trip, or exercise it from whichever of CR-027/
CR-086 consumes it first) before or during whichever CR wires this client into
a real code path.

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

### KI-017 — `packages/maps-2gis` (and `packages/db`) export raw TS source, not compiled `dist`

Status: open. Discovered: 2026-09-12 (CR-007).
Problem: both packages' `package.json` `main`/`types`/`exports` point at
`./src/*.ts`, not `./dist/*.js`. `tsx` (dev) and `tsc` (typecheck, and
build-time type resolution) both handle that fine — confirmed live for the
`packages/types` case, which is pure types and therefore never needs runtime
resolution at all (`import type` is fully erased, verified by inspecting
compiled `apps/api` output). But `packages/maps-2gis`'s
`create2GisMapProvider` and `packages/db`'s `createDbClient` are real
runtime values, not types — a plain `node dist/server.js` (no `tsx`) trying
to `import` either package at runtime would fail to resolve a `.ts` file,
since Node doesn't understand that extension without a loader.
Impact: none today — neither package has a real consumer yet (`apps/api`
doesn't import `db` until CR-011, doesn't import `maps-2gis` until CR-026/
CR-028/CR-084), so this has never actually been exercised end to end.
`packages/maps-core` and `packages/types` are unaffected by construction:
both are 100% type-only (`interface`s only), so they can never have a
runtime resolution question regardless of what their `exports` field says.
Workaround: none needed yet.
Next action: before wiring `maps-2gis` or `db` into any code path `apps/api`
actually runs via `node dist/server.js` (not `tsx`), switch that package to
declaration-based `dist` exports (`"types": "./dist/index.d.ts"`, `"main":
"./dist/index.js"`, `"exports"` pointing at `dist`, `"declaration": true` in
its `tsconfig.json` — the root `tsconfig.base.json` sets `declaration:
false` for application entry points, which is correct for `apps/*` but not
for a library package meant to be imported elsewhere) and confirm `node
dist/server.js` actually boots with a real cross-package import.

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

---

## Resolved

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
