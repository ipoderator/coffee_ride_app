# MVP Backlog

## Pre-foundation hardening

Decisions and config that are cheap now and a breaking change once code exists — done
2026-09-11 before CR-001, see `docs/changelog.md`.

- [x] CR-067 Node 24 LTS, exact `packageManager` version, CI token permissions, root lint
      actually running in CI
- [x] CR-068 Declare environment in `turbo.json` (Turborepo 2 strict env mode)
- [x] CR-069 API contract: `/v1` prefix, cursor pagination, RFC 9457 errors — ADR-011
- [x] CR-070 `timestamptz` everywhere + ride-local IANA timezone — ADR-012
- [x] CR-071 Split 2GIS keys: public MapGL vs server-side Geocoder/Directions
- [x] CR-072 Bind local infrastructure ports to `127.0.0.1`
- [x] CR-087 Run Prettier over the whole repository as one isolated commit — done
      2026-09-12, formatting-only, see `docs/changelog.md`.
- [ ] CR-073 Zod environment validation at API startup; refuse to boot in production on
      placeholder/missing values (implemented inside CR-003)

## Foundation

- [x] CR-001 Initialize pnpm/Turborepo monorepo — done 2026-09-12: `pnpm-lock.yaml`
      generated, `tsconfig.base.json` added, root scripts and turbo tasks verified
      against zero packages. See `docs/changelog.md`.
- [ ] CR-002 Configure Next.js web
- [ ] CR-003 Configure Fastify API
- [ ] CR-004 Configure PostgreSQL + Drizzle
- [ ] CR-005 Configure Redis
- [ ] CR-006 Configure MinIO/S3 adapter
- [ ] CR-007 Configure shared packages
- [ ] CR-008 Configure Vitest/Playwright
- [ ] CR-009 Configure Docker Compose
- [ ] CR-010 Configure CI + Git hooks

## Design foundations

Must land before the first user-facing screen (CR-011's register form) — see
`docs/design.md`. Retrofitting tokens, formatters and states after the screens exist is a
rewrite, not a polish pass.

- [ ] CR-063 Design tokens in `packages/ui` (light + dark palette, typography, spacing,
      radius) exposed via the Tailwind theme; lint rule rejecting raw hex colors in
      `apps/web`
- [ ] CR-064 Russian formatters (distance/elevation/pace/duration/date/price/participants)
      and the UI terminology mapping (status, bicycle type, services) as one shared,
      unit-tested module — `docs/design.md` §7, §13
- [ ] CR-065 Metric presentation components: `MetricTile`, `MetricRow`, `StatusBadge`,
      `DifficultyScale` — `docs/design.md` §6
- [ ] CR-066 Shared state primitives: `Skeleton`, `EmptyState`, `ErrorState` + the
      degraded-state pattern used by CR-052 — `docs/design.md` §10

## Auth

- [ ] CR-011 User registration
- [ ] CR-012 Login/logout/session
- [ ] CR-013 Profile

## Organizer

- [ ] CR-014 Organizer profile
- [ ] CR-015 Organizer dashboard
- [ ] CR-016 Organizer authorization

## Rides

- [ ] CR-017 Create ride
- [ ] CR-018 Edit draft
- [ ] CR-019 Publish ride
- [ ] CR-020 Close registration
- [ ] CR-021 Cancel ride
- [ ] CR-022 Finish ride
- [ ] CR-023 Ride detail
- [ ] CR-024 Ride list
- [ ] CR-025 Filters
- [ ] CR-026 Map discovery

## Route

- [ ] CR-027 GPX upload
- [ ] CR-028 Route rendering
- [ ] CR-029 Route metadata
- [ ] CR-030 Stops
- [ ] CR-031 Route points

## Registration

- [ ] CR-032 Register
- [ ] CR-033 Cancel registration
- [ ] CR-034 Capacity enforcement
- [ ] CR-035 Duplicate protection
- [ ] CR-036 Waitlist
- [ ] CR-037 Organizer participant list

## Communication

- [ ] CR-038 Registration confirmation
- [ ] CR-039 Ride updates
- [ ] CR-040 Cancellation notification
- [ ] CR-041 In-app notifications

## Post-ride

- [ ] CR-042 Review
- [ ] CR-043 Organizer rating summary

## Quality

These three are **verification passes over screens already built to `docs/design.md`**,
not the point where responsive/a11y/state work starts. A screen that ships without them
is not done (`docs/definition-of-done.md`).

- [ ] CR-044 Responsive UI — audit against `docs/design.md` §11
- [ ] CR-045 Accessibility — audit against `docs/design.md` §12 (WCAG 2.1 AA)
- [ ] CR-046 Error/loading/empty states — audit against `docs/design.md` §10
- [ ] CR-047 Security review
- [ ] CR-048 Performance review

## Resilience

- [ ] CR-049 Timeout/retry/circuit-breaker utilities for external integrations (2GIS Maps, S3)
- [ ] CR-050 Async notification delivery via Redis queue (decoupled from registration transaction)
- [ ] CR-051 Health check endpoint (`apps/api`) reporting DB/Redis/S3 status
- [ ] CR-052 Frontend degraded-state handling (maps/uploads unavailable)

## Extensibility foundations

- [ ] CR-053 Split `packages/maps-core` (interface) + `packages/maps-2gis` (adapter) — ADR-010
- [ ] CR-054 Feature registry for dashboard nav/widgets (organizer + participant cabinets) — ADR-009
- [ ] CR-055 Feature flag utility for staged cabinet feature rollout — ADR-009
- [ ] CR-056 Document/lint rule preventing direct 2GIS SDK imports outside `packages/maps-2gis`

## Security foundations

- [ ] CR-057 Password hashing (Argon2id/bcrypt) + minimum password policy
- [ ] CR-058 Auth rate limiting (login/register/forgot-password, per IP + per account)
- [ ] CR-059 Email verification flow (gates organizer publish action)
- [ ] CR-060 Password reset flow (single-use, time-limited tokens, no account enumeration)
- [ ] CR-061 Security headers (helmet-equivalent) + CSRF mechanism for cookie sessions
- [x] CR-062 Session store decision — database-backed sessions + single-origin `/api`,
      decided 2026-09-11 in ADR-013; implemented by CR-012

## Deployment

Deliberately deferred until there is something to deploy (see `docs/changelog.md`,
2026-09-11). These are not "nice to have" — nothing ships to a server without them.

- [ ] CR-074 `Dockerfile` for `apps/web` and `apps/api` + `.dockerignore` (multi-stage,
      non-root user, Next.js standalone output)
- [ ] CR-075 Production manifest: reverse proxy serving the web app and `/api` on one
      origin (ADR-013), TLS, resource limits, restart policy
- [ ] CR-076 Migrations as an explicit deploy step — safe when several API instances start
      at once (never on application boot)
- [ ] CR-077 Redis hardening: password, AOF persistence (the notification queue lives
      there — CR-050), healthcheck
- [ ] CR-078 PostgreSQL backups + a restore actually verified, not just scheduled
- [ ] CR-079 Structured logging (pino + request id) and error reporting; background job
      failures must be visible (`.claude/rules/resilience.md`)
- [ ] CR-080 CI gaps: MinIO service, migration step, Playwright e2e job
- [ ] CR-081 Full production environment variable set in `.env.example` + deployment
      documentation
- [ ] CR-082 Pin `minio/minio` to a release tag; review base image versions

## Contract & model follow-ups

Found during the 2026-09-11 audit, cheaper before the related feature is built.

- [ ] CR-083 Idempotency for `POST /v1/rides/:id/register` (network retry must not create
      a second registration; the DB constraint is the backstop, not the design)
- [ ] CR-084 Decide the geo query approach for map discovery (bbox/radius): PostGIS vs
      built-in types + index strategy — needed by CR-026
- [ ] CR-085 GPX parsing must not block the event loop: size limit, streaming or worker —
      needed by CR-027
- [ ] CR-086 Cover image pipeline: size/type limits, resizing, how files are served
      (direct S3 vs proxy) — needed by CR-017
