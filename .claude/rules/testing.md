# Testing Rules

Test behavior, not implementation details.

## Unit/integration

Cover:

- ride lifecycle;
- organizer ownership;
- registration;
- duplicate registration;
- full ride;
- waitlist;
- cancellation;
- authorization;
- route/stops persistence.

## Security (`.claude/rules/security.md`)

Cover:

- login/register happy path and generic-error-on-failure behavior (no account
  enumeration);
- password reset: token validity, single-use, expiry;
- rate limiting on auth endpoints actually rejects beyond the threshold;
- an authenticated-but-not-owner request is rejected (not just an unauthenticated one);
- no endpoint returns more participant data than the caller's capability allows.

## Resilience (`.claude/rules/resilience.md`)

Cover, at least for the 2GIS adapter and any queued notification job:

- a timed-out/failing external call degrades per the documented fallback instead of
  failing the whole request;
- a queued side-effect job failing does not roll back or block the action that
  triggered it;
- retries are only exercised for idempotent operations.

## Maps adapter (`.claude/rules/maps.md`)

When more than one `packages/maps-*` adapter exists, run the same geocode/reverse-geocode/
route-building test cases against each implementation to verify interface parity, not
just that the currently-active one works.

## Extensibility / regression (`.claude/rules/extensibility.md`)

Any change to `packages/ui`, `packages/types`, or a shared API contract needs its tests
run against both the organizer and participant cabinets, not just the one being worked on
— that's what actually catches "feature N+1 broke feature N."

## E2E

Critical journeys:

- participant discovers and registers;
- organizer creates/publishes ride;
- organizer views participants.

Every bug fix should add regression coverage when practical.

A failing test is a development problem to investigate, not something to bypass.

## Live and contract tests (CR-137)

Opt-in suites that hit real services — each skips itself unless its flag is set:

- `RUN_LIVE_S3_TESTS=1` (+ `S3_*`): `route-storage.live.test.ts` and
  `file-storage.live.test.ts` (GPX/cover upload → object → download → replace →
  delete, over HTTP against MinIO).
- `RUN_LIVE_REDIS_TESTS=1` (+ `REDIS_URL`): `queue.live.test.ts` (a registration
  reaches the inbox through BullMQ); CR-058's block in `auth.routes.test.ts` runs
  whenever `REDIS_URL` is set.
- `RUN_2GIS_CONTRACT_TESTS=1` (+ `MAPS_2GIS_API_KEY`):
  `packages/maps-2gis/src/provider.contract.test.ts`, only in the manual/weekly
  `.github/workflows/maps-contract.yml` job (protected `maps-2gis-contract`
  environment) — never on PRs.

CI's `ci` job sets the S3 and Redis flags; a new flag must also go into
`turbo.json`'s `test`/`test:coverage` env or turbo drops it (KI-050).

## Load testing (CR-139)

A separate k6 suite (`load/`, `load/README.md`) — manual or nightly
(`.github/workflows/load-test.yml`, `workflow_dispatch` + nightly cron), never part of
the `pull_request`/`push` `ci` job: parallel registration for the last open slot,
the waitlist-promotion race, rate limiting under concurrent load, bulk ride-list
retrieval, large GPX files/long routes, and API p95/p99 response times. These need a
real running `apps/api` under genuine concurrency, which Vitest/Playwright's
single-request-at-a-time style can't exercise meaningfully — they are correctness/
performance checks against a live target, not a substitute for the unit/integration
coverage above (registration/waitlist correctness is still covered there with mocked
concurrency at the DB-transaction level).

Two of the six scenarios enforce exact-count invariants (capacity never exceeded,
every freed slot promotes exactly one FIFO waitlist entry) via k6 thresholds that fail
the run's exit code — a regression here should be treated as seriously as a failing
Vitest assertion, not just a "nice to know" perf number.

## Visual regression and adaptive checks (CR-138)

`apps/web/e2e/visual-regression.spec.ts` (`toHaveScreenshot`, chromium + mobile
projects) covers five key screens: discovery grid/map, a ride card, the ride
detail page (registration is inline there — there is no separate route),
and the organizer dashboard. `themes.spec.ts`'s own `visual baseline` block
covers light/dark. `mobile-cabinets.spec.ts` covers the organizer sidebar/
`CabinetSectionTabs` (`lg`) and participant hamburger/`BottomTabBar` (`md`)
breakpoints — functionally (element visibility), not by screenshot.

- **Second Playwright project**: `mobile` (`devices['Pixel 5']`), scoped via
  per-project `testMatch` to only the specs that assert something at that
  width — every other spec still runs exactly once (desktop). Pixel 5, not
  an iPhone preset: it already defaults to the `chromium` engine, so CI's
  Chromium-only `playwright install` step doesn't need a second browser.
- **`expect.toHaveScreenshot` options** (`playwright.config.ts`):
  `maxDiffPixelRatio: 0.02` (tolerates anti-aliasing noise, not a real
  regression) and `animations: 'disabled'`.
- **Baselines must be generated to match CI** (`ubuntu-latest`, the pinned
  `@playwright/test` version), never by running Playwright natively on a
  developer's Mac/Windows machine — font rendering and anti-aliasing differ
  enough to make every comparison fail. Regenerate via Docker:
  ```
  docker run --rm -v "$PWD":/work -w /work/apps/web \
    mcr.microsoft.com/playwright:v<version>-jammy \
    npx playwright test --update-snapshots
  ```
  (`<version>` = the installed `@playwright/test` version, `apps/web/package.json`).
  Commit the resulting `e2e/*.spec.ts-snapshots/` directories — they are
  baselines, not build output, so they are never gitignored.
- **No map tiles to fight with**: CI never sets
  `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` (same reasoning as the coverage note
  below), so `RouteMap`/`DiscoveryMap` always render their static, provider-
  free placeholder in every screenshot here — never a live, network-dependent
  2GIS render. A local run with a real key configured (`.env`) will
  legitimately produce different screenshots for exactly that reason; that's
  a local-environment mismatch, not a real regression.
- **A signed-in viewer's own email is not deterministic**: `registerAndVerify`
  mints a random-UUID email per call, and the shared `AppHeader` renders it as
  visible text once authenticated. Seed fixtures for a _public_ screen
  (discovery, ride detail) through an isolated `APIRequestContext`
  (`e2e/helpers/ui.ts`'s `newIsolatedRequest`), never `page.request` — the
  page itself then stays anonymous and shows the fixed "Войти"/"Регистрация"
  links. A screen that requires a session to view at all (the organizer
  dashboard) has no such option; mask the account-menu trigger instead
  (`toHaveScreenshot`'s `mask` option) rather than fighting the email.
- **Discovery list mocking**: `GET /v1/rides` sorts soonest-first and defaults
  to a page of 20 (`rides.service.ts`'s `listPublicRides`) — on a database
  that already has other rides (any shared dev DB, or a CI run with earlier
  specs' fixtures), a freshly seeded ride can be several pages deep, or sort
  behind a `startsAt` far enough in the future to never appear at all. The
  discovery screenshots proxy the real request through
  (`route.fetch({ url })`, raising `limit` to the API's own max of 100) and
  filter its `items` down to the one ride the test created — real,
  correctly-shaped API data, but deterministic regardless of what else is in
  the database.
- **Relative-to-now content**: a start countdown, an organizer greeting keyed
  off the hour, and a per-day registration chart are all computed from the
  browser's own clock. Freeze it with `page.clock.install({ time })` _before_
  `page.goto`, paired with a ride created at a fixed absolute `startsAt`
  (`e2e/helpers/api-fixtures.ts`'s `createPublishedRideAt`) rather than an
  offset from real `Date.now()` — otherwise the rendered text drifts
  depending on what day/hour the suite happens to run.
- **`page.route` for error/empty states**: `e2e/helpers/mock.ts`'s
  `mockApiError` is the one shared pattern for provoking a state a real
  backend won't produce on demand (an upload's `*_storage_unavailable`, a
  500 from the ride list) — every other spec still drives the real API/DB
  stack, which stays the default.

## Coverage (CR-136)

`pnpm test:coverage` runs every Vitest suite with v8 coverage (shared options:
`packages/config/vitest/coverage.js`); `pnpm coverage:check` compares the
result with the committed `coverage-baseline.json` — per-package totals plus
each `apps/api` module separately. CI runs both and fails the PR on any drop
beyond the 0.1 pp noise tolerance; the HTML/lcov reports are the `coverage`
artifact of the run, the table is in the job summary.

- The baseline is a floor that only rises. After a change that raises coverage,
  run `pnpm test:coverage && pnpm coverage:baseline` and commit the file.
- Never lower it to get a PR green. If a drop is legitimate (well-tested code
  deleted), run `pnpm coverage:baseline --allow-decrease`, say why in
  `docs/changelog.md`, and label the PR `coverage-decrease-approved` — CI
  otherwise also holds the PR to the base branch's baseline.
- No blanket percentage target (no "80%"). Raise the bar module by module,
  API and critical modules (registrations, auth, rides) first; a new or
  touched module should leave its own row higher than it found it.
- Measure with the CI environment: Postgres, Redis, MinIO up,
  `RUN_LIVE_S3_TESTS=1`, `RUN_LIVE_REDIS_TESTS=1` with `REDIS_URL` set, and no
  `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` in the shell (KI-070) — otherwise skipped
  suites lower the numbers.
