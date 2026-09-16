# Current task

## Task ID

CR-049 — "Timeout/retry/circuit-breaker utilities for external integrations (2GIS Maps,
S3)".

## Goal

Both existing external-call sites (`packages/maps-2gis/src/http.ts`'s `fetchJson`,
`apps/api/src/modules/rides/route-storage.ts`'s ad hoc `withResilience`) already have
per-call timeouts and were explicitly built with a comment deferring bounded retries +
a circuit breaker to "the shared timeout/retry/circuit-breaker utility CR-049 builds"
(`packages/maps-2gis/src/errors.ts`, `route-storage.ts`, `docs/decisions.md` ADR-015).
This task builds that shared utility and wires both call sites to it, per
`.claude/rules/resilience.md`'s "every external call must have: an explicit timeout; a
bounded number of retries with backoff, only for idempotent operations; a circuit
breaker ... so a degraded provider doesn't cascade into request pileups".

## Requirements / acceptance criteria

- New shared package (`packages/resilience`) exporting: `callWithResilience` (timeout +
  bounded retry with backoff, driven by an `AbortSignal` so both `fetch` and the AWS S3
  SDK's `abortSignal` option work unchanged), `CircuitBreaker` (closed/open/half-open,
  trips after N consecutive failures, cools down, single half-open trial call), and
  `ResilienceError` (stable error type carrying a `code`: `timeout` | `exhausted` |
  `circuit_open`).
- `packages/maps-2gis`: `fetchJson` retries (2 attempts, geocode/reverseGeocode/getRoute
  are read-only 2GIS calls — safe to retry) and shares one `CircuitBreaker` per
  `MapProvider` instance across all three methods; `MapProviderError` still the only
  error type callers of `MapProvider` ever see (unwraps `ResilienceError`, preserves
  `status` for non-2xx failures).
- `apps/api/src/modules/rides/route-storage.ts`: replace its local `withResilience`
  with the shared utility + a module-level breaker (PUT/GET/DELETE by key are
  idempotent, same reasoning already documented there); `RouteStorageError` stays the
  only error type its callers see.
- No behavior change to any existing caller's error handling — `rides.service.ts`
  already catches `RouteStorageError` for the degraded-storage response, that contract
  doesn't move.
- Architecture docs updated for the new package + its dependency direction
  (`apps/api` → `resilience`, `packages/maps-2gis` → `resilience`): `docs/architecture.md`,
  `.claude/rules/architecture.md`, `.claude/context/architecture-map.md`,
  `.claude/rules/resilience.md` (point at the concrete implementation), new ADR-016 in
  `docs/decisions.md`.
- Own unit tests for `packages/resilience` (retry/backoff, timeout normalization,
  breaker state transitions). Existing `packages/maps-2gis` tests
  (`provider.test.ts`) must keep passing unmodified in behavior (may need timeout
  fixture tweaks since a failure now takes 2 attempts, not 1).

## Planned files

- `packages/resilience/` (new): `package.json`, `tsconfig.json`, `eslint.config.mjs`,
  `vitest.config.ts`, `src/index.ts`, `src/circuit-breaker.ts`, `src/call-with-resilience.ts`,
  `src/errors.ts`, plus `*.test.ts` for each.
- `packages/maps-2gis/src/{http.ts,geocode.ts,route.ts,provider.ts,errors.ts}`,
  `package.json` (add `resilience` dep).
- `apps/api/src/modules/rides/route-storage.ts`, `apps/api/package.json` (add
  `resilience` dep).
- `docs/architecture.md`, `.claude/rules/architecture.md`,
  `.claude/context/architecture-map.md`, `.claude/rules/resilience.md`,
  `docs/decisions.md` (ADR-016).
- `docs/tasks.md`, `docs/changelog.md`, `.claude/context/project-state.md`.

## Implementation progress

- [x] `packages/resilience` package scaffolded + implemented + unit-tested
      (`CircuitBreaker`, `callWithResilience`, `ResilienceError`, 15 tests).
- [x] `packages/maps-2gis` wired to the shared utility (`http.ts`/`geocode.ts`/
      `route.ts`/`provider.ts`, one breaker per provider instance).
- [x] `apps/api/src/modules/rides/route-storage.ts` wired to the shared utility
      (module-level breaker, same `RouteStorageError` contract preserved).
- [x] Architecture/rules/ADR docs updated (`docs/architecture.md`,
      `.claude/rules/architecture.md`, `.claude/rules/resilience.md`,
      `.claude/context/architecture-map.md`, `docs/decisions.md` ADR-016).
- [x] Validation (lint/typecheck/test/build across `resilience`, `maps-2gis`,
      `api`, plus a full-workspace `turbo run typecheck lint`).
- [x] Context docs updated (`docs/tasks.md`, `docs/changelog.md`,
      `project-state.md`).

## Validation results

`pnpm --filter resilience run test` — 15/15 passed (circuit-breaker state
transitions incl. half-open trial, retry/backoff, timeout normalization).
`pnpm --filter maps-2gis run test` — 11/11 passed unmodified (existing
`provider.test.ts` fixtures still hold with retry+breaker added underneath).
`pnpm --filter api run test` (against a real local Postgres, `.env` sourced)
— 255/255 passed across all 13 files, including `route.routes.test.ts`'s
S3-failure test exercising the new breaker/retry path. `pnpm --filter
resilience --filter maps-2gis --filter api run typecheck/lint/build` — all
clean. `pnpm turbo run typecheck lint` (whole workspace, 9 packages) — 17/17
tasks passed, confirming no unrelated package (`apps/web`, `packages/ui`,
etc.) was affected.

## Discovered issues

None — a slow npm registry (`ERR_SOCKET_TIMEOUT` retries, ~7 min for the
workspace-wide `pnpm install` needed to link the new `resilience` workspace
dependency into `apps/api`/`packages/maps-2gis`) was an environment hiccup,
not a code issue; the install eventually succeeded on retry with no lockfile
conflicts.

## Final result

CR-049 (Resilience: timeout/retry/circuit-breaker utilities) is complete and
shipped. New `packages/resilience` package (ADR-016) provides
`callWithResilience`/`CircuitBreaker`/`ResilienceError`; both existing
external-call sites (`packages/maps-2gis`'s `fetchJson`, `apps/api`'s S3
`route-storage.ts`) now retry once (idempotent calls only) and share one
circuit breaker per integration instead of their previous
timeout-only/hand-rolled-retry implementations. No caller-visible error
contract changed (`MapProviderError`/`RouteStorageError` still the only
error types their consumers see). Next logical task: CR-050 (async
notification delivery via Redis queue) — next in the Resilience backlog
section, though blocked on KI-014 (Redis never live-verified in this
environment) the same way CR-058 is.
