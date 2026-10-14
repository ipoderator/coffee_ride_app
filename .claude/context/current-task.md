# Current task — CR-265 — Maintenance mode and the unexpected-error state

Source: owner, 2026-10-14 (mockup package `reference/coffee-ride-auth-mockup/`, tab
«Техработы», prompt 3 of `CLAUDE-CLOUD-PROMPTS.md`, brief item 7) — reference only,
never edited. No subagents; commit and push to `experiments` when done (owner).

## Goal

A planned-maintenance mode switched by env (no image swap), answering `503` +
`Retry-After` with the mockup's «Технический пит-стоп» screen, while health checks,
static assets and the provider callbacks keep working; a separate unexpected-error
state; a static fallback page at the reverse proxy for when `web` itself is down.

## Requirements

- Screen per mockup (brand, h1, text, «Обновить страницу», «Написать нам», status
  line) — no route line, points or illustration; existing tokens/components only.
- `MAINTENANCE_MODE=true` (+ `MAINTENANCE_RETRY_AFTER_SECONDS`, default 600) on
  `web` and `api`; `docker compose up -d web api` toggles it, no rebuild.
- web: every document → 503 + `Retry-After` + `Cache-Control: no-store` +
  `X-Robots-Tag: noindex`; RSC/prefetch requests → bare 503 (client falls back to a
  full load). Not gated: `/_next/static`, `/_next/image`, `/favicon.ico`,
  `/icon.svg`, `/robots.txt`, `/api/*` (the API decides).
- api: `/v1/*` → 503 problem+json `maintenance` + `Retry-After`; not gated: `/health`,
  `/docs`, the Google/Yandex/Strava callbacks.
- Unexpected error: `app/error.tsx` + `app/global-error.tsx`, same frame, no
  `error.message`/digest/stack shown.
- Caddy: `handle_errors 502 503 504` → `deploy/maintenance/index.html` (self-contained,
  no Next/API/DB), 503 + `Retry-After`.
- Keyboard: real `<button>`/`<a>`, visible focus; mobile 320–390 without overflow.

## Acceptance

- [x] on/off via env, 503 + Retry-After + no-store + noindex (web and api) — tests
- [x] `/health`, static assets, callbacks reachable in maintenance — tests
- [x] refresh reloads, mailto link, keyboard order — tests + Chromium
- [x] no stack/secret/internal text in maintenance or error responses — tests
- [x] desktop/mobile screenshots, no overflow
- [x] Caddyfile validated (`caddy validate`), fallback served with 503 when web is down
- [x] tests, lint, typecheck, build green

## Progress

- Done: api `plugins/maintenance.ts` + env; web proxy/layout/`/maintenance`/error
  states/`SystemStatusScreen`; ui `SYSTEM_STATUS_TERMS`; Caddy fallback + compose +
  env examples; runbook `deploy/MAINTENANCE.md`; ADR-040; docs.

## Validation

- format:check (only untracked `reference/`), lint, lint:root, typecheck, build 7/7.
- test:coverage (live Redis/S3): api 916, web 1062, ui 300, db 17, resilience 15,
  maps-2gis 82 (+6); coverage:check holds, baseline raised. (A first api run failed
  `queue.live.test` because a dev API's BullMQ worker shared the Redis queue — rerun
  without it: green.)
- Storybook 326/331 — the 5 failures are KI-100, identical on clean HEAD; new stories 4/4.
- e2e critical-journeys, login-return, password-reset, themes: 13/13.
- `caddy validate` + `fmt`; local Caddy: web down → static 503 + Retry-After 60, web's
  503 passes through.
- Chromium (dev and `next start` built without the flag): 503 + Retry-After + no-store +
  noindex, robots/icon/static 200, 1440/768/390/320 both themes no overflow, Tab order,
  Enter reloads, mailto, no leaks or console errors; flag on with an open tab → client
  nav gets the screen; flag off → refresh 200.

## Discovered issues

- The real error boundary is not reachable on a live route on demand (the app degrades
  gracefully when the API is down) — covered by unit tests and Storybook.
- `/favicon.ico` 404 (no such file; pre-existing, not gated).

## Final result

Implemented and validated; committed on `experiments`, cherry-picked onto `main` as `feat/cr-265-maintenance-mode` (PR).
