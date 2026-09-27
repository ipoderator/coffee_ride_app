# Current task

**CR-139 — Load testing (P3)**

Status: complete, committed.

## Goal

A separate manual/nightly k6 suite (never part of the Vitest/Playwright CI gate) for the
load/concurrency scenarios out of Vitest/Playwright's reach: parallel registration for
the last open slot, the waitlist-promotion race, rate limiting under concurrent load,
bulk ride-list retrieval, large GPX files/long routes, and API p95/p99 response times.

## Requirements / acceptance criteria

- [x] `load/k6/lib/{config.js,api.js}` — shared HTTP helpers ported from
      `apps/web/e2e/helpers/api-fixtures.ts`'s register/verify/login/organizer/
      ride-lifecycle flow.
- [x] `load/k6/scenarios/last-slot-registration.js` — exact-count capacity invariant.
- [x] `load/k6/scenarios/waitlist-promotion-race.js` — exact-count + FIFO-order
      promotion invariant.
- [x] `load/k6/scenarios/rate-limiting.js` — per-IP auth (5/min) and global (100/min)
      limits actually reject beyond threshold.
- [x] `load/k6/scenarios/bulk-ride-list.js` — cursor pagination correctness + latency
      under concurrent readers.
- [x] `load/k6/scenarios/gpx-large-route.js` — near-10 MB upload bound, oversized
      rejection, `/health` latency unaffected during upload (ADR-015).
- [x] `load/k6/scenarios/api-latency.js` — p95/p99 baseline for a mixed read load.
- [x] `load/run-all.sh` + `load/README.md`.
- [x] `.github/workflows/load-test.yml` — `workflow_dispatch` + nightly cron, two jobs
      (default limits for `rate-limiting.js`, raised limits for the rest).
- [x] `eslint.config.mjs` — ignore `load/**` (k6's own runtime/module specifiers).
- [x] `package.json` — `load:test` script.
- [x] `.claude/rules/testing.md` — Load testing subsection.
- [x] `docs/tasks.md` — CR-139 entry.
- [x] `docs/changelog.md` — append entry.

## Implementation progress

All done.

## Validation results

- `pnpm format`/`pnpm lint:root`: clean.
- Live-verified, not just written: installed k6 locally; migrated a disposable scratch
  Postgres database (`coffee_ride_loadtest_scratch`, never `coffee_ride_dev`); ran two
  real local `apps/api` instances against it — one with `AUTH_RATE_LIMIT_MAX`/
  `RATE_LIMIT_MAX` raised (everything but rate-limiting.js), one with the real defaults
  (rate-limiting.js only), same split `load/README.md` documents. All six scenarios
  passed every threshold at reduced scale: last-slot race (capacity 3/3 extra — exactly
  3 succeeded, exactly 3 `ride_full`); waitlist race (capacity 3/waitlist 5 — oldest 3
  promoted FIFO, newest 2 left waiting, ride re-filled to exactly capacity); rate
  limiting (exactly 5/5 login 401/429, exactly 100/10 global 200/429); bulk list and
  API latency well under their p95/p99 budgets; GPX upload accepted, oversized upload
  rejected in ~60 ms, concurrent `/health` p95 ~12 ms throughout the upload.
- Found and fixed one real bug during this validation: `uniqueEmail()` referenced
  k6's `__ITER`, which is undefined inside `setup()`/`teardown()` (where most accounts
  in this suite are created) — threw `ReferenceError` immediately. Replaced with an
  in-module counter + timestamp + random, no `__VU`/`__ITER` dependency.
- Scratch database and both scratch `apps/api` processes torn down afterward; the
  developer's own running dev instance (`:4000`, `coffee_ride_dev`) was never touched
  or restarted.
- `.github/workflows/load-test.yml` YAML-parsed successfully; not run on GitHub Actions
  itself (needs a real push/dispatch to verify job wiring — same standing gap
  `maps-contract.yml` still has).

## Discovered issues

- None outstanding for this ticket. `docs/changelog.md` had no CR-138 entry yet when
  this task started (a concurrent session was still finishing that ticket's review) —
  resolved on its own once that session appended its entry; this file previously
  tracked CR-138 as "in progress," now superseded by that session's own completion.
