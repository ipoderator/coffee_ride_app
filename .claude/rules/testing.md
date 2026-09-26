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
