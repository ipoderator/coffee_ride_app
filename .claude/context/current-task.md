# Current task — CR-210: pre-launch configuration readiness (preflight, first-deploy checklist, error-tracking ADR) — DONE

Source: owner — a pre-launch blocker list (infra/DNS, commercial 2GIS key KI-075,
empty `EMAIL_FROM_ADDRESS`, error-tracking vendor undecided) with "давай все
исправим". Scope negotiated down in-session: four of the five items are external
actions the owner performs on their own machine/accounts; this task makes the
repository turn each one into "set the value and it works", loudly.

## Approved scope

1. **Preflight validation of production configuration** — a second tier below
   `loadEnv()`'s existing hard-fail `PRODUCTION_PLACEHOLDER_CHECKS`: configurations
   that parse cleanly but mean a broken user-facing feature in production. Surfaced
   both as a standalone `pnpm preflight` and as loud warnings at API boot.
2. **First-deploy checklist** (KI-045) — `deploy/FIRST-DEPLOY.md`: what
   `docker-smoke` already proves, what still needs a real host (Caddy ACME/TLS, the
   `backup` service), with the exact verification command per step.
3. **Error-tracking ADR** — record the decision instead of leaving
   `ERROR_REPORTING_WEBHOOK_URL` "undecided" in three files. Vendor choice is the
   owner's; asked in-session.

Explicitly **out of scope** (owner did not select): mapping 2GIS's 403
demo-key/quota refusal to its own error code instead of `unavailable` → 503. See
"Discovered issues".

## Requirements

- Preflight must not change `loadEnv()`'s existing boot-refusal behavior — a warning
  tier only; nothing that boots today may stop booting.
- Warnings must name the field and the user-visible consequence, never the value
  (`.claude/rules/security.md`: never log secrets).
- `pnpm preflight` must be runnable against a `.env` file without booting the API, so
  the operator can check configuration before `docker compose up`.
- Every warning needs a test; no new dependency.

## Acceptance criteria

- `pnpm preflight` reports the current `.env`'s gaps, exits non-zero only on hard
  errors, zero on warnings alone. ✅ (repo `.env` → ERROR tier, exit 1; a realistic
  production file → 2 warnings, exit 0)
- Empty `EMAIL_FROM_ADDRESS` with `UNISENDER_API_KEY` set is reported, not silent. ✅
  (`preflight.test.ts` "reports an email key with no verified sender address")
- `deploy/FIRST-DEPLOY.md` exists and distinguishes smoke-proven from host-only. ✅
- An ADR records the error-tracking decision; `.env.example` and `docs/deployment.md`
  stop saying "undecided". ✅ (ADR-030, owner chose stdout + webhook seam)
- `pnpm typecheck`, `pnpm lint`, the api unit suite, Prettier clean. ✅ (typecheck 8/8
  with api's new second pass over `scripts/`; lint 9/9 + `lint:root`; api 612
  passed/8 skipped; `coverage:check` holds at or above baseline)

## Implementation progress

- `apps/api/src/preflight.ts` — pure `runPreflight(env): PreflightFinding[]`; each
  finding carries `keys` / `problem` / `consequence` / `action`, never a value.
- `apps/api/scripts/preflight.ts` — `pnpm preflight [--env <path>]`; parses the file
  into a private object (never merged into `process.env`, so an ambient variable
  can't satisfy a check) and forces `NODE_ENV=production`.
- `apps/api/src/server.ts` — the same findings logged at boot, in `server.ts` rather
  than `buildApp` so the test suite's deliberately-degraded instances stay quiet.
- `apps/api/tsconfig.scripts.json` + a second `typecheck` pass — `scripts/` was
  outside `tsc` entirely (`tsconfig.json` is scoped to `src` for the build's
  `outDir`), so a type error in an operator script would first surface during a
  deploy. Verified the pass actually fails on an injected error.
- `eslint.config.mjs` — `no-console: off` for `scripts/**`, matching the existing
  skill-scripts override; deliberately not extended to `src/**`.
- `deploy/FIRST-DEPLOY.md`, ADR-030, and the "undecided" text in `.env.example` /
  `docs/deployment.md` / `env.ts` replaced with the decision.

## Validation results

Full live stack (`set -a && source .env && set +a`, postgres/redis/s3 running,
`RUN_LIVE_REDIS_TESTS=1 RUN_LIVE_S3_TESTS=1`, `TEST_DATABASE_URL` on 127.0.0.1):

- api 612 passed / 8 skipped; `pnpm test:coverage` 6/6 tasks.
- `pnpm coverage:check` — "Coverage holds at or above the baseline"; auth branches
  81.82 (+1.18). `preflight.ts` itself is 100 % lines/branches.
- typecheck 8/8 (api runs both passes), lint 9/9, `lint:root` clean,
  `pnpm format:check` clean.
- `pnpm preflight` exercised on both tiers (exit 1 / exit 0).

## Discovered issues

- **2GIS 403 → 503 "route builder unavailable"** (KI-075, out of this task's scope):
  a commercial key changes the limit, it does not remove it. Quota/licence refusals
  will keep arriving as 403 and keep rendering as "сервис недоступен" rather than
  "точки слишком далеко друг от друга". Needs its own CR.
- The owner's list said KI-006 was "not resolved since CR-079". It is resolved and
  archived; what is open is only the vendor choice. Corrected in-session.

## Final result

Done. Three deliverables landed as approved; the 2GIS 403 mapping was explicitly out
of scope and is now tracked as its own candidate CR (`project-state.md` → Next §5).

Two defects were found and fixed along the way, neither in the approved scope:

1. `MAPS_2GIS_API_KEY` lacked the empty-string-from-Compose preprocessing every other
   optional var got when KI-046 was fixed — the type claimed a key was configured when
   Compose had passed `''`. No behavior change (`plugins/maps.ts` tests truthiness, so
   it degraded correctly by luck), but anything testing for `undefined` was wrong.
2. `apps/api/scripts/` was outside `tsc`. Pre-existing — `build.mjs` is plain JS, so
   nothing had noticed; adding a TypeScript script there would have shipped unchecked.

One process note worth keeping: the coverage gate appeared red, reproducibly and
byte-identically, across three full runs before the cause turned out to be my own
invocation — `RUN_LIVE_*` flags alone are not enough, because each live suite also
checks for its own variables (`REDIS_URL`, the four `S3_*`) and skips silently without
them. `set -a && source .env && set +a` is mandatory; the tell is `N skipped > 0`.
The memory note has been corrected.
