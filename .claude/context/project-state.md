# Project State

## Phase

MVP / Foundation

## Current task

None active. Pre-foundation hardening (CR-067..CR-072), CR-087 (repository-wide
Prettier formatting), CR-001 (monorepo tooling initialized), and CR-002 (`apps/web`
scaffolded) all completed 2026-09-12.

## Implemented

Harness, project specification, and pre-foundation decisions. Root monorepo tooling is
operational (CR-001). `apps/web` exists (CR-002): Next.js 15 + Tailwind v4 + shadcn/ui
foundation, builds/typechecks/lints clean, placeholder home page smoke-tested. No other
`apps/*`/`packages/*` exist yet — `apps/api` starts with CR-003.

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

## In progress

None.

## Next

CR-003 — Configure Fastify API.

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
  (KI-008) and the Format check step (KI-011) are both resolved; `apps/web` (CR-002)
  is the first workspace member CI can actually lint/typecheck/build, but there's no
  test runner for it yet (CR-008) and `apps/api`/`packages/*` still don't exist
  (CR-003..CR-007);
- lint-staged's pre-commit `eslint --fix` does not cover `apps/*`/`packages/*` staged
  files — only `turbo lint` in CI does (KI-012, CR-010);
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
