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

`packages/ui` (CR-007, content since CR-063/CR-064/CR-065): design tokens
(`src/tokens.css`, CSS custom properties consumed by `apps/web` via a real
package `exports` entry), Russian number/unit formatters + UI terminology
mapping (`src/format.ts`/`src/terminology.ts`, `docs/design.md` §7/§13), and
its first four real components (`src/components/{MetricTile,MetricRow,
StatusBadge,DifficultyScale}.tsx`, §6) plus a shared `cn` helper
(`src/lib/cn.ts`). Vitest switched from CR-064's `node`-environment fragment
to a package-local jsdom + Testing Library config once components needed
real DOM rendering (54 tests across 6 files). All re-exported from
`src/index.ts` (was `export {}` through CR-007). `apps/web` doesn't import
any of these yet (`transpilePackages` still unset — no real screen exists
before CR-011), but Tailwind now scans `packages/ui/src` regardless, via an
`@source` directive added to `apps/web/src/app/globals.css` (KI-R10) — found
because Tailwind v4's automatic content detection never crosses into a
sibling monorepo package on its own, which silently dropped every one of
`packages/ui`'s own Tailwind classes until fixed. Next: CR-066's `Skeleton`/
`EmptyState`/`ErrorState`, which will likely finally force KI-020's
shadcn-vendoring-target question (`Skeleton` is a real shadcn primitive,
unlike any of CR-065's four).

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
