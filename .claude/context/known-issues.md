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
Status: open, expected. Discovered: 2026-09-10.
Problem: no `pnpm-lock.yaml` until CR-001 creates the workspace packages.
Impact: red CI until Foundation lands. Not a regression.
Next action: CR-001.

### KI-009 — Contract/model follow-ups found in the audit
Status: open. Discovered: 2026-09-11.
Problem: registration is not idempotent against network retries (CR-083); the geo query
approach for map discovery is undecided (CR-084); GPX parsing would block the Node event
loop if done synchronously in a request (CR-085); the cover image pipeline is unspecified
(CR-086).
Impact: each is cheap to address before the related feature is built and expensive after.
Next action: CR-083..CR-086, each before its dependent feature task.

### KI-011 — The repository has never matched its own Prettier config
Status: open. Discovered: 2026-09-11.
Problem: `prettier --check .` fails on 37 files, and it fails identically on the initial
commit — this predates any current work. The differences are cosmetic (blank lines after
headings, before lists) but touch every markdown file end to end.
Impact: CI's `Format check` step fails before it ever reaches lint/typecheck, for reasons
unrelated to whatever change is being tested.
Workaround: none; it is noise, not breakage.
Next action: CR-087 — one formatting-only commit, deliberately kept separate from
content changes so the diff stays reviewable.

### KI-010 — ADR-010 map boundary is enforced by review only
Status: open. Discovered: earlier; restated 2026-09-11.
Problem: the lint rule forbidding direct 2GIS SDK imports outside `packages/maps-2gis`
does not exist yet.
Next action: CR-056.

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
