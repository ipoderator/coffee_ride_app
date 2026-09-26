# Current task

**CR-137 — Files and external integrations: failure/contract scenarios (P2)**

Status: complete, committed (together with CR-136 — see `docs/changelog.md`).

## Goal

Scenario coverage for the external dependencies: S3/MinIO file round trips,
what happens when S3/Redis are down (what `/health` reports and what the UI
gets), 2GIS failures, and a live 2GIS contract test for a protected CI run.

## Scope decision

`apps/web` deliberately never calls `GET /health` (KI-041: reactive per-call
degraded states, no proactive banner without a `docs/design.md` spec). So
"UI reaction to S3/Redis errors in /health" is tested as a chain: dependency
down → `/health` reports it → the API answers the documented 503 codes / keeps
critical journeys working → the web components render the degraded notice for
exactly those codes.

## Requirements / acceptance criteria

- [x] Live MinIO (gated `RUN_LIVE_S3_TESTS=1`), over HTTP through `buildApp`:
      GPX upload → object in bucket → download bytes equal → replace deletes
      the old object → delete removes it; cover upload → object → GET → delete.
- [x] S3 unreachable: `/health` s3=`error`/`degraded` (200, bounded time);
      GPX/cover uploads 503 `route_storage_unavailable`/`cover_storage_unavailable`;
      ride reads still 200.
- [x] Redis unreachable: `/health` redis=`error`; register/login/ride create/
      registration still succeed (fail-open rate limit, enqueue never blocks).
- [x] 2GIS adapter: a real hung request times out (bounded attempts), the
      breaker then short-circuits; malformed-but-valid-JSON bodies become
      `MapProviderError`, never a raw `TypeError`; API answers 503 for them.
- [x] Missing key: API (exists) + web route builder shows the
      `route_builder_unavailable` message (new test).
- [x] Contract test `provider.contract.test.ts` (gated
      `RUN_2GIS_CONTRACT_TESTS=1` + key) and a `workflow_dispatch`/schedule
      workflow bound to a protected GitHub environment; never on PRs.
- [x] lint, typecheck, format, tests, coverage gate (baseline raised).

## Planned files

- `apps/api/src/test-support/app-fixtures.ts` (new, shared helpers)
- `apps/api/src/modules/rides/file-storage.live.test.ts` (new)
- `apps/api/src/degraded-dependencies.test.ts` (new)
- `packages/maps-2gis/src/{route.ts,geocode.ts,provider.test.ts,provider.contract.test.ts}`
- `apps/api/src/modules/rides/route-builder.routes.test.ts`
- `apps/web/src/features/organizer/route/route-builder.test.tsx`
- `.github/workflows/maps-contract.yml`, `turbo.json` (env passthrough)
- docs/context

## Progress

All items done — see `docs/changelog.md` (CR-137).

## Validation

- `pnpm test:coverage` 5/5 with Postgres/Redis/MinIO, `RUN_LIVE_S3_TESTS=1`,
  `RUN_LIVE_REDIS_TESTS=1`: api 459 passed / 0 skipped, maps-2gis 41 (+4
  contract skipped), web 392, ui 152, resilience 15; coverage gate passes
  after raising the baseline (web untouched — noise).
- Regressions proven: the old `route.ts` → the two new API tests get 500; the
  old `queue.ts` → the Redis journey test times out.
- `turbo lint typecheck` 17/17, `format:check` clean.
- 2GIS contract test run locally: every call times out (KI-056 egress);
  the gate/skip path verified.

## Discovered issues

- Fixed: Redis outage stalled every request; 2GIS off-shape body → 500;
  timeout misreported as "request failed".
- KI-071: notifications dropped while Redis is down (needs a decision).
- Not verifiable here: GitHub runs (KI-068), live 2GIS (KI-056).

## Final result

Done; committed together with CR-136.
