# Maintenance mode — production runbook (CR-265)

Below, `dc` means
`docker compose -f docker-compose.prod.yml -f docker-compose.infra.yml --env-file .env`,
run from the repository checkout on the host (as in `FIRST-DEPLOY.md`).

## What it does

| Layer                            | While `MAINTENANCE_MODE=true`                                                                                                                                                |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web` (`src/proxy.ts`)           | every page → `503`, `Retry-After`, `noindex`, the «Технический пит-стоп» screen; `/robots.txt`, `/icon.svg`, `/_next/static`, `/_next/image`, `/favicon.ico` served as usual |
| `api` (`plugins/maintenance.ts`) | every `/v1/*` → `503` problem+json `code: "maintenance"` + `Retry-After`; **not** gated: `GET /health`, `/docs`, the Google/Yandex/Strava callbacks                          |
| `caddy`                          | unchanged; if `web` does not answer at all (restart, deploy, crash) it serves `deploy/maintenance/index.html` with `503` + `Retry-After: 60`                                 |

Background jobs (the BullMQ worker inside `api`) keep running. Nothing is cached:
every answer carries `no-store`/`no-cache`.

## Switch on

1. In `.env`: `MAINTENANCE_MODE=true`; optionally `MAINTENANCE_RETRY_AFTER_SECONDS=1800`
   (the expected duration; default 600).
2. `dc up -d --no-build web api` — recreates the two containers with the new env (a few
   seconds; Caddy's static page covers the gap).
3. Check:
   - `curl -sI https://<DOMAIN>/ | grep -iE '^HTTP|retry-after'` → `503`, `Retry-After`;
   - `curl -s -o /dev/null -w '%{http_code}\n' https://<DOMAIN>/api/v1/rides` → `503`;
   - `dc exec web wget -qO- http://api:4000/health` → JSON with `"status"`.

## Do the work

Migrations: `dc --profile migrate run --rm migrate`. A full `deploy/deploy.sh` keeps the
mode on — it starts the containers with the same `.env`.

## Switch off

1. In `.env`: `MAINTENANCE_MODE=` (empty).
2. `dc up -d --no-build web api`.
3. Check: `curl -sI https://<DOMAIN>/` → `200`, no `Retry-After`; open the site, sign in.

## Notes

- Only `true` or `1` turns it on; any other value (a typo included) leaves the site
  serving — check step 3 every time.
- The static page needs no switch: it appears only when `web` is unreachable. It is a
  copy of the screen kept in step by hand (texts, colours, contact address).
- A change to `deploy/Caddyfile` or `deploy/maintenance/` reaches Caddy with
  `dc up -d caddy` (the files are mounted read-only); `deploy/deploy.sh` does it too.
