# Current task

## Task ID

CR-080 — CI gaps: MinIO service, migration step, Playwright e2e job
(`docs/tasks.md` Deployment section, KI-007).

## Goal

Close the remaining real gaps KI-007 names in `.github/workflows/ci.yml`:
CI cannot test S3 uploads against a real store, and never runs the
Playwright e2e suite at all.

## Investigation

- The "migration step" part of KI-007 is actually stale: `pnpm --filter db
db:migrate` has been a real CI step since CR-011 (`git log -- .github/
workflows/ci.yml` confirms), but KI-007's text was never corrected after
  that landed. Fixing the doc, not the CI file, for that third of the
  ticket.
- `apps/web/src/app/page.tsx` (`/`) is the real discovery screen since
  CR-024, not the CR-002 bootstrap placeholder the existing
  `apps/web/e2e/home.spec.ts` still asserts on (`getByText('Платформа
собирается...')`) — that copy doesn't exist anywhere in the app anymore.
  Wiring this spec into CI unmodified would just add an immediately-failing
  check, not close a gap. Rewrote it to assert against the real page
  (`RIDE_DISCOVERY_TERMS.pageTitle`/`emptyTitle` from `packages/ui`) — this
  also happens to be a genuine end-to-end check (web -> api -> a real,
  freshly migrated, empty Postgres) rather than a static-content check.
- `.claude/rules/testing.md` names three critical-journey e2e specs
  (discover+register, organizer create+publish, organizer view
  participants) that don't exist yet — no ticket currently owns writing
  them (checked `docs/tasks.md`/known-issues for any CR number; none).
  Out of scope for this ticket (it's "wire CI", not "write the e2e suite")
  — recording as a new ticket (CR-092) rather than silently expanding scope
  or leaving it untracked, same "real gap, add a ticket" precedent as
  KI-024/025/026.
- `playwright.config.ts`'s `webServer` currently only starts `apps/web`
  (`pnpm dev` = `next dev`). That was fine when `/` was static, but since
  CR-024 the page calls the real `GET /v1/rides` through `apps/web`'s own
  `/api/v1/*` rewrite (`API_INTERNAL_URL`, default `localhost:4000`) — so
  `apps/api` must also be running for any e2e spec to work, wired or not.
  Playwright supports an array of `webServer` entries (started in order,
  each waited on its own `url`) since 1.34 — confirmed installed version is
  1.63.0. Using that instead of a hand-rolled background-process dance in
  the CI YAML keeps the exact same command working identically in local dev
  and CI.
- `apps/api/src/server.ts` reads env via `loadEnv()`/`process.env` (unlike
  the test suite, which builds `env` objects directly) — it needs
  `AUTH_SECRET`/`WEB_ORIGIN`/`DATABASE_URL` really set in its process env
  to boot. `ci.yml`'s current job-level `env:` only has `NODE_ENV`/
  `DATABASE_URL`/`REDIS_URL` — missing `AUTH_SECRET`/`WEB_ORIGIN` (never
  needed before since nothing ever booted a real `apps/api` process in CI).
- No Playwright browser install step exists anywhere in CI (never needed —
  the job never ran `playwright test` before).
- `apps/api/src/modules/rides/route.routes.test.ts` (and the rest of that
  suite) mock `@aws-sdk/client-s3` at the module level — there is no
  existing test file that hits a real S3-compatible store, which is exactly
  what KI-015 has flagged as unverified since CR-006 (blocked throughout on
  Docker being unreachable in every session's _local_ sandbox). GitHub
  Actions runners are a different environment — they have real Docker for
  service containers — so a MinIO service + one real (not mocked)
  round-trip test in CI is the first place this can actually be exercised,
  even though it can't be verified locally in this session.
- `docker-compose.yml`'s `minio` service is `quay.io/minio/minio:RELEASE.2025-09-07T16-13-09Z`
  — reusing the identical pinned tag in CI keeps the two environments
  consistent (CR-082 is "pin/review base images" generally, but this
  specific tag already exists and is already pinned; nothing to change
  there for this ticket).
- Bucket creation: MinIO doesn't auto-create a bucket. GitHub's
  `ubuntu-latest` runner ships `aws-cli` preinstalled — `aws --endpoint-url
http://localhost:9000 s3 mb s3://<bucket>` against the MinIO service's
  root credentials needs no extra container/binary.

## Decision

- `.github/workflows/ci.yml`: add a `minio` service (same pinned image as
  `docker-compose.yml`), add `S3_*`/`AUTH_SECRET`/`WEB_ORIGIN` to the job's
  `env:` block, add a "Create MinIO bucket" step (`aws s3 mb` against the
  service), add a "Install Playwright browsers" step
  (`pnpm --filter web exec playwright install --with-deps chromium`), add
  an "E2E tests" step (`pnpm test:e2e`) after the existing `Build` step.
- `apps/web/playwright.config.ts`: `webServer` becomes a two-entry array —
  `apps/api` first (`cwd: '../api'`, `tsx src/server.ts` with no watch,
  waited on `http://localhost:4000/health`, env defaulted for local dev
  convenience so a developer doesn't have to export anything beyond what
  their existing root `.env` already gives `apps/api` via its own
  `process.loadEnvFile` fallback), then `apps/web` (unchanged command,
  waited on `http://localhost:3000`).
- `apps/web/e2e/home.spec.ts`: rewritten to assert the real discovery page
  (`pageTitle`/`emptyTitle`), not the removed placeholder copy.
- New `apps/api/src/modules/rides/route-storage.live.test.ts`: a real
  (unmocked) upload/download/delete round trip through `route-storage.ts`'s
  exported functions against whatever `S3_*` env vars are actually present
  — `describe.skipIf(!process.env.S3_ENDPOINT)` so it's a silent no-op
  anywhere MinIO isn't configured (every local sandbox so far, per KI-015)
  and a real, live check the moment CI's new `minio` service exists.
- Correct KI-007: the migration-step complaint was already stale; narrow it
  to what's actually still missing before this ticket, then resolve it here.
- New ticket, CR-092 (`docs/tasks.md`), for the still-missing critical-
  journey e2e specs `.claude/rules/testing.md` names — not this ticket's
  scope.

## Requirements / acceptance criteria

- CI has a MinIO service; a real (non-mocked) S3 round-trip test exists and
  is gated so it only runs where `S3_*` are actually configured.
- CI installs Playwright browsers and runs `pnpm test:e2e` with both
  `apps/api` and `apps/web` actually serving real requests.
- The existing e2e spec asserts against the real, current home page, not
  removed placeholder copy.
- KI-007 corrected/resolved; CR-092 opened for the still-missing
  critical-journey specs.
- Everything CI-side is necessarily unverified by a live GitHub Actions run
  in this session (no such run is possible here) — verified instead via
  careful review, `docker compose -f docker-compose.yml config`-equivalent
  YAML sanity, and running the exact same commands locally wherever
  possible (`pnpm turbo run lint typecheck build test`, and the new live S3
  test skipping cleanly with no `S3_ENDPOINT` set locally).

## Planned files

- `.github/workflows/ci.yml`
- `apps/web/playwright.config.ts`
- `apps/web/e2e/home.spec.ts`
- `apps/api/src/modules/rides/route-storage.live.test.ts` (new)
- `.claude/context/known-issues.md` (KI-007 resolved/corrected)
- `docs/tasks.md` (check off CR-080, add CR-092)
- `docs/changelog.md`, `.claude/context/project-state.md`

## Implementation progress

- [x] `route-storage.live.test.ts` (new, skip-gated on `RUN_LIVE_S3_TESTS`).
- [x] `playwright.config.ts` two-webServer array.
- [x] `home.spec.ts` rewritten.
- [x] `ci.yml` updated (minio service, env, bucket step, playwright install,
      e2e step).
- [x] `pnpm turbo run lint typecheck build test` + local e2e smoke check.
- [x] Docs/context updated, `git diff` reviewed.

## Validation results

- `pnpm test:e2e` run locally from a clean state (both stale dev-server
  processes killed first — see Discovered issues): the new two-webServer
  config started a real `apps/api` and `apps/web`, the rewritten
  `home.spec.ts` passed end to end (~12s total incl. both servers' startup)
  against this environment's real local Postgres. Ports confirmed free
  again afterward — Playwright cleaned up its own spawned processes.
- `route-storage.live.test.ts` run twice: with no `RUN_LIVE_S3_TESTS` (this
  environment's normal state) — skipped cleanly, 0 attempted connections;
  with `RUN_LIVE_S3_TESTS=1` forced — genuinely attempted a real S3 call and
  failed with `RouteStorageError` (no MinIO running locally), proving the
  gate discriminates correctly in both directions before trusting it in CI.
- `pnpm turbo run lint typecheck build test --filter='!web'` (DATABASE_URL
  sourced): 25/25 tasks green, 299 passed + 1 skipped `apps/api` tests.
  `apps/web` built separately, `NODE_ENV=production pnpm --filter web
build` (KI-038's documented workaround): succeeded, all 14 routes.
- The `minio` service + Playwright job inside `ci.yml` itself cannot be
  verified by an actual GitHub Actions run from this sandbox — reviewed
  carefully instead (mirrors `docker-compose.yml`'s already-working `minio`
  service definition; `S3_*`/bucket values match what the new live test and
  `route-storage.ts` expect).

## Discovered issues

Found and fixed one real self-inflicted issue while debugging why the
rewritten e2e spec initially hung on the loading skeleton: this session's
earlier CR-078 work had run `NODE_ENV=production pnpm --filter web build`
in this same working tree, overwriting `apps/web/.next` with production
output. A `next dev` process left running from before that build (started
outside this conversation, well before CR-078) was still listening on
:3000 but now serving stale HTML referencing chunk paths no longer on disk
— 404s on every `_next/static/chunks/*` request, so React never hydrated
and the discovery fetch never fired. Killed both stale processes (the
`apps/api`/`apps/web` dev servers on :4000/:3000) and re-ran clean, which
is what actually surfaced the two-webServer config working correctly. Not
a regression in this ticket's own changes — a trap worth remembering for
any future session that runs a production build and a dev server in the
same tree without restarting the latter afterward.

Also found the `RUN_LIVE_S3_TESTS` gating issue itself during
implementation (see Decision/Validation above) — the first version of
`route-storage.live.test.ts` gated on "are `S3_*` set", which is true in
this environment's real `.env` even with no MinIO running, so the test
failed instead of skipping. Fixed before it ever reached the git diff.

## Final result

CR-080 closed. `ci.yml` has a real `minio` service, a bucket-creation step,
a Playwright browser-install step, and an `E2E tests` step; the e2e job
and the new S3 round-trip test are both live-verifiable for the first time
the moment CI actually runs (GitHub Actions has real Docker, unlike this
sandbox). `playwright.config.ts`/`home.spec.ts` updated to match the app's
real current state (discovery page, not the removed placeholder) and
proven to work locally end to end. KI-007 resolved (with its stale
migration-step claim corrected along the way). New ticket CR-092 opened
for the still-missing critical-journey e2e specs — deliberately not
written under this ticket's own scope. `docs/tasks.md`,
`docs/changelog.md`, `.claude/context/project-state.md`,
`.claude/context/known-issues.md` all updated. Next logical task: CR-081
(env vars + deployment docs), CR-082 (pin MinIO/base images), or CR-092
(critical-journey specs) — no fixed order decided yet.
