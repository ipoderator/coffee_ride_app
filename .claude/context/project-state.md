# Project State

## Phase

MVP / Foundation

## Current task

None active. Pre-foundation hardening (CR-067..CR-072) completed 2026-09-11; CR-087
(repository-wide Prettier formatting) and CR-001 (monorepo tooling initialized)
completed 2026-09-12.

## Implemented

Harness, project specification, and pre-foundation decisions. Root monorepo tooling is
now operational (CR-001), but no `apps/*` or `packages/*` workspace members exist yet —
that starts with CR-002.

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

## In progress

None.

## Next

CR-002 — Configure Next.js web.

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
- CI cannot test uploads and does not run e2e (KI-007, CR-080); the install step
  (KI-008) and the Format check step (KI-011) are both resolved now, but CI still has
  nothing to actually build/test/lint at the workspace level until CR-002..CR-007 add
  `apps/*`/`packages/*`;
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
