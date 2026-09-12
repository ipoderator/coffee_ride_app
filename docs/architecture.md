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

## Backend

`route/controller → validation → use case/service → repository/db`

## Infrastructure

Local development:

- PostgreSQL
- Redis
- MinIO as S3-compatible storage

Production provider choices can vary and must be recorded as ADRs.

## Maps

2GIS integration is isolated from domain logic.

## Resilience

Modular monolith, not microservices — see `docs/decisions.md` ADR-008 and
`.claude/rules/resilience.md`. Failure isolation comes from timeouts/retries/circuit
breakers on external calls, async processing for non-critical side effects (notifications),
and strict internal module boundaries — not from splitting into separate deployed services.

## Long-term rule

Prefer boring, explicit architecture over premature abstractions.
