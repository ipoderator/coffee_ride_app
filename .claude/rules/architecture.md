# Architecture Rules

## Monorepo

- `apps/web`: Next.js UI.
- `apps/api`: Fastify REST API and application/domain logic.
- `packages/db`: Drizzle schema, migrations, database client.
- `packages/types`: shared domain/API types.
- `packages/ui`: reusable UI.
- `packages/config`: shared tooling configuration.
- `packages/maps-core`: provider-neutral map interface (`MapProvider`) and types (ADR-010).
- `packages/maps-2gis`: 2GIS adapter implementing `packages/maps-core`. The only package
  allowed to import the 2GIS SDK.

## Dependency direction

Allowed:

- web → types/ui/maps-core
- api → db/types/maps-core
- db → types only when needed
- one composition point (web or api config, not scattered call sites) → maps-2gis, to
  wire the concrete adapter behind the maps-core interface

Forbidden:

- web → db
- db → web
- ui → database
- presentational components → persistence/business rules
- any package other than the composition point → maps-2gis directly (see
  `.claude/rules/maps.md`)

## Backend

Prefer:
`route/controller → validation → use case/service → repository/db`

HTTP handlers should be thin.

## Feature boundaries

Organize backend by capability where practical:

- auth
- users
- organizers
- rides
- routes
- registrations
- notifications
- reviews

Avoid giant cross-domain services.

## Change control

For a significant architecture change:

1. update `docs/architecture.md`;
2. append an ADR to `docs/decisions.md`;
3. explain migration/rollback implications;
4. update `.claude/context/architecture-map.md`;
5. update the relevant `.claude/rules/*.md` file if one exists for the affected concern
   (`resilience.md`, `security.md`, `extensibility.md`, `maps.md`) — a rules file that
   falls out of sync with an accepted ADR is a bug, not a documentation nicety.

Do not silently change the architecture.
