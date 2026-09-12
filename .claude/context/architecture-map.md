# Architecture Map

## Current state

Root tooling is operational (CR-001, 2026-09-12). `apps/web` now exists (CR-002,
2026-09-12): Next.js 15.5.25 (App Router, `src/` dir per `.claude/rules/
extensibility.md`), React 19.3.0, TypeScript 6.0.3 (pinned below the version
`typescript-eslint@8.70.0` supports — see `docs/changelog.md`), Tailwind CSS v4
(CSS-first config, no `tailwind.config.js`), and the shadcn/ui foundation
(`components.json`, `cn` helper, baseline neutral CSS-variable theme — real tokens
are CR-063, not yet applied). `turbo lint/typecheck/build` all pass for it; no test
runner wired yet (CR-008). `apps/api` and every `packages/*` still do not exist —
created by CR-003..CR-007.

## Target structure

apps/

- web/ ← exists (CR-002)
- api/

packages/

- db/
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
