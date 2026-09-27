# Load testing (CR-139)

A separate, manual/nightly [k6](https://k6.io/) suite — deliberately **not** part of the
`pull_request`/`push` CI gate (`.claude/rules/testing.md`). It targets a real running
`apps/api` and asserts invariants under real concurrency that Vitest/Playwright can't
exercise meaningfully: registration/waitlist races, rate limiting, bulk listing, large
GPX uploads, and API p95/p99 latency.

Chose k6 over Artillery: scenarios as plain JS (matches the rest of the repo), built-in
`checks`/`thresholds` that fail the run's exit code on a violated invariant (not just a
printed report), and native VU/iteration executors that model "N users hit the same
endpoint at the same instant" directly.

**Never run this against a real production deployment without explicit authorization** —
it creates real accounts/rides and deliberately tries to break capacity/rate-limit
invariants.

## Scenarios

| File                         | What it proves                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rate-limiting.js`           | The per-IP auth (5/min) and global (100/min) rate limits actually reject beyond their threshold under a real concurrent burst.                                                           |
| `last-slot-registration.js`  | `CAPACITY` concurrent registrations for the last open slot(s) — exactly `CAPACITY` succeed, the rest get `409 ride_full`, never an overbook.                                             |
| `waitlist-promotion-race.js` | Concurrent cancellations each promote exactly one FIFO waitlist entry — no double-promotion, no capacity overflow, order preserved.                                                      |
| `bulk-ride-list.js`          | `GET /v1/rides` cursor pagination stays correct and fast against a database with many rides, under concurrent readers.                                                                   |
| `gpx-large-route.js`         | A near-10 MB GPX (many track points) uploads within a bounded time; an over-limit file is rejected fast; the streaming parser doesn't block `/health` for concurrent requests (ADR-015). |
| `api-latency.js`             | p95/p99 response time baseline for a realistic discovery/detail/health read mix.                                                                                                         |

## Running locally

```bash
pnpm infra:up            # postgres/redis/minio
pnpm --filter db db:migrate
pnpm --filter api dev &  # or: pnpm --filter api exec tsx src/server.ts

./load/run-all.sh        # all scenarios, in the right order
SCENARIO=bulk-ride-list ./load/run-all.sh   # just one
```

Every scenario reads `BASE_URL` (default `http://localhost:4000`) and its own tunables
(`CAPACITY`, `RIDE_COUNT`, `VUS`, `DURATION`, ...) via `-e NAME=value` or an exported env
var — see each scenario file's header comment.

### The one target-config split that matters

`rate-limiting.js` needs the **real, default** rate limits (`AUTH_RATE_LIMIT_MAX`/
`RATE_LIMIT_MAX` unset) to prove they actually fire.

Every other scenario needs those two env vars **raised** on the target `apps/api`
instance — same test/dev-only override `playwright.config.ts`'s e2e webServer already
uses (`AUTH_RATE_LIMIT_MAX=1000`, `RATE_LIMIT_MAX=10000`; `apps/api/src/env.ts` refuses
both outside `NODE_ENV=production`). Without it, a scenario that creates several
accounts or issues a sustained read burst from one IP trips the same abuse-prevention
limiter `rate-limiting.js` is dedicated to testing, and fails for the wrong reason.

So: run `rate-limiting.js` against a plain `pnpm --filter api dev`; run everything else
against an instance started with those two env vars set. `run-all.sh` doesn't restart
the API between scenarios — point it at two different target instances (or restart the
API with different env between the two groups) if running the full suite end to end.

## Running nightly in CI

`.github/workflows/load-test.yml` — `workflow_dispatch` plus a nightly schedule, never
on `pull_request`/`push` (same reasoning as `maps-contract.yml`). Two jobs, each
starting its own Postgres/Redis/MinIO/`apps/api`: `rate-limit-check` (default limits)
and `load` (limits raised, the other five scenarios).
