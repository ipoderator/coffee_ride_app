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
completed 2026-09-12.

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
`packages/ui` (intentionally empty, `export {}` — first content is CR-063);
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

## In progress

None.

## Next

CR-009 — Configure Docker Compose.

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
- Design direction (not an ADR — see `docs/design.md`): calm, low-saturation palette,
  warm neutral base with one muted teal-green accent; metric presentation modeled on
  Strava/TrainingPeaks/Rouvy. One exception: `danger` is a bright red (`#D42B20` /
  `#FF5A4F`), reserved for cancellation and failure, allowed as a filled badge.

## Known limitations

Full list with IDs and next actions: `.claude/context/known-issues.md`. In short:

- nothing exists for deployment — no Dockerfile, manifest, proxy config, backups,
  observability (KI-001, KI-002, KI-006; CR-074..CR-079);
- Redis is unauthenticated, without persistence or healthcheck (KI-003, CR-077);
- MinIO healthcheck probably never turns green, image unpinned (KI-004, KI-005);
- CI cannot test uploads and does not run e2e (KI-007, CR-080 — Vitest now
  runs in CI via the existing `Test` step, but Playwright does not); the
  install step (KI-008) and the Format check step (KI-011) are both resolved;
  all eight workspace members (`apps/web`, `apps/api`, `packages/db`/`types`/
  `ui`/`config`/`maps-core`/`maps-2gis`) lint/typecheck/build clean via
  `turbo`; three of them (`apps/api`, `apps/web`, `packages/maps-2gis`) now
  have real passing Vitest suites (CR-008), the other five intentionally
  don't yet (nothing real to test);
- lint-staged's pre-commit `eslint --fix` does not cover `apps/*`/`packages/*` staged
  files — only `turbo lint` in CI does (KI-012, CR-010);
- `apps/api`'s Redis and S3 clients (CR-005, CR-006) have never been connected
  to a live service — Docker unavailable all session, no local fallback for
  either (KI-014, KI-015; verify before CR-050/CR-058/CR-027/CR-086 consume
  them);
- `packages/maps-2gis`'s Geocoder/Routing response parsing is unverified
  against a live 2GIS account (KI-016), and it (plus `packages/db`) export raw
  TS source rather than compiled `dist` output — harmless until either gets a
  real runtime consumer under plain `node`, not `tsx` (KI-017);
- contract/model follow-ups: registration idempotency, geo query approach, GPX parsing off
  the event loop, cover image pipeline (KI-009, CR-083..CR-086);
- the ADR-010 map boundary is held by review discipline only until CR-056 (KI-010);
- production 2GIS credentials, notification provider (ADR-007 Pending) and S3 provider are
  still absent;
- `docs/api.md` describes auth and `/health` endpoints that have no implementation
  (contract-first, deliberate);
- `docs/design.md` exists but nothing implements it — CR-063/CR-064 block CR-011.

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

2026-09-12
