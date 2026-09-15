# Project State

This file is a **snapshot** of current state, overwritten each time — not a history.
For the full narrative of how the project got here (decisions, bugs found, live
verification steps), see `docs/changelog.md`.

## Phase

MVP. Foundation, Design-foundations, and Auth phases complete. Rides: full organizer
lifecycle (`draft → published → registration_open → registration_closed → started →
finished`, plus `cancelled`) implemented end to end; public discovery with filters and
a map view; GPX route upload/rendering/distance-elevation reconciliation; named
organizer-curated stops. Route section remaining: CR-031 (Route points) — see
`docs/tasks.md`.

## Current task

None active.

## Implemented

**Infra/tooling**: pnpm + Turborepo monorepo, Node 24 LTS. Git on `main`, remote
`origin` (github.com/ipoderator/coffee_ride_app, public). CI (GitHub Actions) runs
format/lint/typecheck/build/test plus DB migrations. Husky/lint-staged is
workspace-aware (each package linted with its own config). `docker-compose.yml`
defines Postgres/Redis/MinIO but has never been live-booted in this environment —
Docker's daemon is unreachable here (KI-019; see `docker-desktop-unavailable` in
Claude's project memory).

**apps/web**: Next.js 15 + React 19 + TS 6.0.3, Tailwind v4 + shadcn/ui, real design
tokens/typography/Russian formatting from `docs/design.md` via `packages/ui`. Screens:
`/register`, `/login`, `/me` + `/me/profile`, `/organizer` (dashboard) + `/organizer/
profile` + `/organizer/rides` (list/new/[id]/edit/[id]/route), `/` (public discovery —
list/map toggle, bicycleType filter, upcoming-only sort) and `/rides/[id]` (public ride
detail, incl. elevation profile). Cabinet shell + nav/widget registries (ADR-009) exist
for both organizer and participant sides — one entry each so far, no feature-flag
support yet (CR-054 generalizes this).

**apps/api**: Fastify 5 + Zod + RFC 9457 errors + OpenAPI (ADR-011, `/v1` prefix,
cursor pagination). Capability modules: `auth` (register/verify-email/login/logout/me,
Argon2id, DB-backed sessions per ADR-013, CSRF via Origin/Referer check on every unsafe
`/v1` method), `users` (profile PATCH), `organizers` (OrganizerProfile CRUD, create
gated on `emailVerified`), `rides` (create/edit draft, every lifecycle transition,
owner's "mine" list, public list + detail with filters/bbox/pagination, GPX route
upload/download/geometry, distance/elevation reconciliation, stop CRUD — draft-only,
embedded as an additive `stops` array on ride detail). Auth endpoints are rate-limited
in-memory only (KI-014 — no live Redis yet).

**packages/db**: Drizzle + Postgres. Tables: `users`, `email_verification_tokens`,
`sessions`, `organizer_profiles`, `rides`, `routes`, `stops`.

**packages/types**: shared Zod contracts + domain types for everything above;
`ProblemDetails`/`Paginated<T>` (ADR-011).

**packages/ui**: design tokens (light/dark, `docs/design.md` §3-5), Russian formatters

- terminology (§6-7, §13), component set — `MetricTile`/`MetricRow`, `StatusBadge`,
  `DifficultyScale`, `Skeleton`, `EmptyState`, `ErrorState`, `Button`/`Input`/
  `FormField`/`Card`/`Textarea`.

**packages/maps-core / packages/maps-2gis**: provider-neutral `MapProvider` interface
(ADR-010) + a 2GIS REST adapter (geocode/reverseGeocode/getRoute, no SDK dependency).
No live 2GIS credential exists in this environment, so every map-rendering surface
(discovery map, route map) shows a real, live-verified degraded state (KI-031) rather
than an actual MapGL render.

Current test counts and per-feature detail: see the latest entries in
`docs/changelog.md` rather than this file — a fixed number here goes stale the moment
the next ticket adds tests.

## In progress

None.

## Next

`docs/tasks.md` Route section: CR-031 ("Route points" — organizer-placed typed
markers, distinct from `Stop`) — the last remaining Route ticket.

## Important decisions

See `docs/decisions.md`. Notably:

- ADR-008: modular monolith, not microservices — failure isolation via
  `.claude/rules/resilience.md`, not via service boundaries.
- ADR-009: feature-module architecture for organizer/participant cabinets — see
  `.claude/rules/extensibility.md`.
- ADR-006 + ADR-013: email+password, capability-based authorization, database-backed
  sessions, single-origin deployment with `SameSite=Lax` + `Origin` check for CSRF and
  no CORS. Full checklist in `.claude/rules/security.md`.
- ADR-010: maps provider (2GIS) accessed only through `packages/maps-core` /
  `packages/maps-2gis` adapter split.
- ADR-011: `/v1` prefix, cursor pagination on every collection, RFC 9457 error
  envelope.
- ADR-012: `timestamptz` everywhere; `Ride` also stores its start location's IANA
  zone.
- ADR-014: map discovery's geo query is plain `startLat`/`startLng` columns + a bbox
  range query (composite B-tree index), not PostGIS — no named radius-search use case,
  no PostGIS in the current Postgres image.
- ADR-015: GPX upload is bounded by a 10 MB size cap (`@fastify/multipart`) plus a
  streaming SAX parse (`sax`), not a worker thread — revisit only if a real perf
  problem is measured at scale.
- Design direction (not an ADR — see `docs/design.md`): calm, low-saturation palette,
  warm neutral base with one muted teal-green accent. One exception: `danger` is a
  bright red, reserved for cancellation/failure (`StatusBadge`, `Button
variant="danger"`).

## Known limitations

Full list with IDs and next actions: `.claude/context/known-issues.md`. Headline
items:

- No deployment artifacts, observability, or a live-verified Redis/S3/Postgres in this
  environment — Docker's daemon is unreachable throughout (KI-001, KI-002, KI-003,
  KI-006, KI-014, KI-015, KI-019).
- `packages/db`/`packages/types`/`packages/maps-2gis` export raw TS source, not
  compiled `dist` — a production boot (`node dist/server.js`) is confirmed broken
  until this is resolved via an ADR (KI-017).
- Auth ships with an interim security posture: no `@fastify/helmet` yet, rate
  limiting is in-memory-per-IP only, no per-account limiting (KI-022).
- No live 2GIS credential — geocoding and MapGL rendering are unverified against a
  real account; every map surface shows a real degraded state instead (KI-016,
  KI-031). No geocode-by-address UI (KI-032); a ride's finish point has no coordinates
  (KI-033).
- No `/verify-email` web screen exists yet (API-only) — an organizer who needs it has
  no in-app recovery path (KI-026).
- Discovery filters cover only `bicycleType`; distance/difficulty/price/date-range
  are deferred, no design-doc backing yet (KI-030).
- Provisional/deferred: `RideService`/registration-state terminology keys pending a
  real DB enum (KI-021); shadcn CLI's vendoring target still points at `apps/web`, not
  `packages/ui`, for any future structurally-complex primitive (KI-020); avatar/logo
  upload needs the S3 pipeline (KI-023).

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

2026-09-15 (CR-030)
