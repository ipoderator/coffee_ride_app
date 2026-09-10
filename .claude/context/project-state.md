# Project State

## Phase
MVP / Foundation

## Current task
None yet.

## Implemented
Harness and project specification only. Application implementation has not started.

## In progress
None.

## Next
CR-001 — Initialize pnpm/Turborepo monorepo.

## Important decisions
See `docs/decisions.md`. Notably:
- ADR-008: modular monolith, not microservices — failure isolation via
  `.claude/rules/resilience.md`, not via service boundaries.
- ADR-009: feature-module architecture for organizer/participant cabinets — see
  `.claude/rules/extensibility.md`. Both cabinets will keep growing; new features
  register into shared surfaces rather than branching into them.
- ADR-006: email+password auth, capability-based authorization (not a rigid role enum).
  Full checklist in `.claude/rules/security.md`.
- ADR-010: maps provider (2GIS) accessed only through `packages/maps-core` /
  `packages/maps-2gis` adapter split, so the provider can be swapped later.

## Known limitations
- Production map provider (2GIS) credentials/configuration are not present.
- Concrete session store (database-backed vs JWT) is the remaining open part of ADR-006.
- Production notification provider is pending.
- Production S3 provider is deployment-specific.
- `packages/maps-core`/`packages/maps-2gis` adapter split not yet implemented (CR-053).
- Security/extensibility rules are documented but not yet enforced by code — CR-057
  through CR-062 and CR-053 through CR-056 are the implementation tasks.
- `docs/api.md` now lists auth endpoints (verify-email, forgot/reset-password) and a
  `/health` endpoint that have no implementation yet — contract-first, per usual.

## Do not break
- documented stack;
- domain terminology;
- API/database boundaries;
- server-side registration invariants;
- server-side authorization checks (never UI-only — `.claude/rules/security.md`);
- the `packages/maps-core` boundary (no direct 2GIS SDK imports outside
  `packages/maps-2gis` — `.claude/rules/maps.md`);
- feature-module isolation between organizer/participant cabinet features
  (`.claude/rules/extensibility.md`).

## Last updated
2026-09-09
