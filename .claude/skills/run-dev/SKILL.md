---
name: run-dev
description: Start the local dev stack (apps/api on :4000 + apps/web on :3000) via `pnpm dev`. Use when the user says "запусти проект"/"запусти бэк и фронт", "start the app", "run the dev servers", "start backend and frontend", or otherwise asks to bring up the local Coffee Ride app for manual testing/verification.
---

# Run the dev stack

Brings up both apps together (root `pnpm dev` → `turbo dev`, `persistent: true`,
`apps/api`'s `tsx watch src/server.ts` on `:4000` + `apps/web`'s `next dev` on
`:3000`). Not for e2e — `apps/web/playwright.config.ts` spins up its own pair of
servers with its own env for that; this skill is for a session that needs the app
running to click around, hit the API directly, or eyeball a change.

## Steps

1. **Check local infra is up**: `docker compose ps` — needs `postgres`, `redis`,
   `minio` all `healthy`. If Docker Desktop is off (`docker info` fails), start it
   (`open -a Docker`) and poll `docker info` until it responds (≤ 90s), then
   `docker compose up -d`.
2. **Check ports are free**: `lsof -iTCP -sTCP:LISTEN -n -P | grep -E ":3000|:4000"`.
   If something is already listening, it's probably a stale dev server from an
   earlier session — reuse it (skip to step 5) rather than starting a second one on
   top, which will fail to bind.
3. **Migrations**, only if this Postgres hasn't been migrated yet (a fresh
   container, or `db:migrate` was never run against it):
   `set -a && source .env && set +a && pnpm --filter db db:migrate`.
4. **Start it, in the background** — this is a persistent, long-running process,
   never a one-shot command:
   ```
   set -a && source .env && set +a && nohup pnpm dev > /tmp/coffeeride-dev.log 2>&1 & disown
   ```
   `source .env` is somewhat redundant (`apps/api`'s own `server.ts` loads the root
   `.env` itself, per `playwright.config.ts`'s comment) but costs nothing and
   guarantees `turbo dev`'s own env-passthrough (`turbo.json`'s `dev` task) sees the
   same values.
5. **Verify readiness by polling, not a blind sleep**:
   ```
   for i in $(seq 1 20); do
     api=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/health)
     web=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000)
     [ "$api" = "200" ] && [ "$web" = "200" ] && echo READY && break
     sleep 2
   done
   ```
   `curl -s http://localhost:4000/health` returns `{"status":"ok","dependencies":
{"db":"ok","redis":...,"s3":"ok"}}` — `redis` can legitimately read
   `not_configured` until something first touches it (a lazy connection, not a
   failure); `db`/`s3` should read `ok`.

## Known local-vs-CI differences (don't "fix" these — they're expected)

- If `.env` has a real `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`, the map renders live
  2GIS tiles locally — CI never sets this var, so `RouteMap`/`DiscoveryMap` always
  fall back to their static placeholder there instead
  (`.claude/rules/testing.md` "Visual regression"). If you need CI-like
  determinism for a specific check (e.g. comparing a screenshot), override it
  empty for just that command: `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY="" pnpm dev`.
- `AUTH_RATE_LIMIT_MAX`/`RATE_LIMIT_MAX` are unset by default here — repeated
  manual register/login against this same server within a minute can trip the
  auth rate limit (KI-014). Export test/dev overrides (see `.env.example`) if
  you're scripting many auth calls against this long-running server, not just
  clicking through the UI a few times.

## Stopping it

`pkill -f "turbo dev"`, or find and kill the PID from
`lsof -iTCP:3000,4000 -sTCP:LISTEN -n -P`. `next dev`/`tsx watch` don't need a
graceful shutdown for local dev.
