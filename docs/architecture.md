# Technical Architecture

## Fixed stack

- pnpm workspaces + Turborepo
- Next.js 15 + React + TypeScript
- Tailwind CSS + shadcn/ui
- Node.js + Fastify + TypeScript
- REST + OpenAPI
- Zod
- PostgreSQL + Drizzle
- Redis
- S3-compatible storage
- 2GIS Maps
- Auth.js-compatible session architecture
- Vitest + Playwright
- ESLint + Prettier
- Husky + lint-staged
- GitHub Actions
- Docker Compose

## Monorepo

`apps/web`
`apps/api`
`packages/db`
`packages/types`
`packages/ui`
`packages/config`
`packages/maps-core` (provider-neutral map interface — see ADR-010, `.claude/rules/maps.md`)
`packages/maps-2gis` (2GIS adapter implementing `packages/maps-core`)
`packages/resilience` (shared timeout/retry/circuit-breaker utility for external
integrations — see ADR-016, `.claude/rules/resilience.md`)

## Backend

`route/controller → validation → use case/service → repository/db`

## Infrastructure

Local development:

- PostgreSQL
- Redis
- MinIO as S3-compatible storage

Production provider choices can vary and must be recorded as ADRs.

Production (CR-075, ADR-018): Caddy reverse-proxies the public origin to `apps/web`
only (`docker-compose.prod.yml`, `deploy/Caddyfile`) — `apps/web`'s own `next.config.
ts` rewrite already forwards `/api/v1/*` to `apps/api` internally, so Caddy never
routes to `apps/api` directly. Automatic TLS via Caddy's built-in ACME. Where
Postgres/Redis/S3 actually run in production is still undecided — `docker-compose.
prod.yml` assumes they're already reachable via `DATABASE_URL`/`REDIS_URL`/`S3_*`,
not containers it starts itself.

## Maps

2GIS integration is isolated from domain logic.

## Resilience

Modular monolith, not microservices — see `docs/decisions.md` ADR-008 and
`.claude/rules/resilience.md`. Failure isolation comes from timeouts/retries/circuit
breakers on external calls, async processing for non-critical side effects (notifications),
and strict internal module boundaries — not from splitting into separate deployed services.
The timeout/retry/circuit-breaker mechanism itself is one shared utility,
`packages/resilience` (ADR-016), wired at each integration's call site
(`packages/maps-2gis`, `apps/api`'s S3 route-storage module) rather than reimplemented
per integration.

## Long-term rule

Prefer boring, explicit architecture over premature abstractions.
