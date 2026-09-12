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

`turbo lint/typecheck/build` pass for both. No test runner wired yet for either
(CR-008).

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

`packages/types`, `packages/ui`, `packages/config`, `packages/maps-core`,
`packages/maps-2gis` still do not exist — created by CR-007 and later.

## Target structure

apps/

- web/ ← exists (CR-002)
- api/ ← exists (CR-003)

packages/

- db/ ← exists (CR-004)
- types/
- ui/
- config/
- maps-core/ (provider-neutral map interface — ADR-010)
- maps-2gis/ (2GIS adapter; only package allowed to import the 2GIS SDK)

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
