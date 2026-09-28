# Current task

## CR-145 — Known-issues sweep (KI-072, KI-062, KI-061, KI-058, KI-073, KI-044)

Status: complete, committed.

### Goal

Close the open known issues the owner listed on 2026-09-28, each with its own
verification; narrow what can't be closed here (KI-045).

### Results per item

- KI-072 — `.github/dependabot.yml`: dev group minor/patch only. Resolved.
- KI-062 — `RIDE_GROUP_PACE_STEP_KMH` in `packages/types`, schema `.multipleOf`,
  form uses it; API test for 27.3 → 400 and 27.5/32.5 accepted. Resolved.
- KI-061 — `RideSectionLink` registry + five feature descriptors; edit page passes
  flag-filtered list; test asserts all five hrefs in order. Resolved.
- KI-058 — `routes.preview` (migration `0020_route_preview`, backfill), written on
  every route write, read by the list. Resolved.
- KI-073 — `threshold: 0.02`; regression reproduced and caught in the CI Playwright
  image (arm64). Resolved pending CI's x86_64 run.
- KI-044 — measured Caddy/Next header behaviour; `TRUST_PROXY_HOPS` +
  `lib/trust-proxy.ts`; prod compose 1; smoke step green. Resolved.
- KI-045 — Caddyfile validated with the official v2.11.4 binary. Still open (ACME,
  backup).
- KI-074 — new: Google Fonts fetched at build time.

### Validation

- Typecheck + lint repo-wide: 17/17.
- Coverage (CI env, Redis/S3 live): api 489/489, web 440/440, ui 155/155,
  maps-2gis 41 (+5 skipped), resilience 15/15; `coverage:check` green; baseline raised.
- `pnpm smoke:docker` green incl. the KI-044 step.
- Migration on a fresh DB, the test DB and the dev DB.

### Discovered

- One unreproduced `avatar.routes.test.ts` `beforeEach` failure in a turbo run
  (three clean full runs after).
- `.env` has `REDIS_URL` commented out: coverage measured from it skips the Redis
  suites and "fails" `notifications`/`auth` — use `.env.example`'s URL.

### Carried over

- CR-114 live 2GIS verification (KI-056, blocked by VPN); contract test has the new
  `no_route` case.
