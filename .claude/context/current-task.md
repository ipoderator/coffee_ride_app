# Current task

## Task ID

CR-061 — "Security headers (`@fastify/helmet`-equivalent)". Last open,
unblocked ticket in the Security foundations section (CR-058 stays blocked
on KI-014 — Redis unverified live in this environment).

## Goal

`.claude/rules/security.md`, Transport & headers: "Apply standard security
headers on API responses (e.g. `@fastify/helmet` or equivalent): CSP,
X-Content-Type-Options, frame-ancestors/X-Frame-Options, Referrer-Policy."
KI-022 (re-confirmed by CR-047's audit): "no `@fastify/helmet` or equivalent
is registered at all — zero security headers, API-wide." CR-061's original
CSRF half was already implemented by CR-012 (`plugins/csrf.ts`, ADR-013) —
this ticket is headers-only, per `docs/tasks.md`'s existing note.

## Investigation

- `apps/api/src/app.ts` registers `registerErrorHandler`, `registerOpenApi`
  (`/docs` Swagger UI + `/documentation/json`), `registerDb`, `registerS3`,
  `registerNotificationQueue`, then `multipart`/`cookie`/`rate-limit`
  plugins, then `healthRoutes` (`/health`, unversioned) and `v1Routes`
  (`/v1/*`, own encapsulated context — CSRF is scoped there deliberately,
  per `csrf.ts`'s own comment, so it never touches `/health`/`/docs`).
- KI-022's own wording ("zero security headers, API-wide") and
  `.claude/rules/security.md`'s "on API responses" (not "on `/v1`
  responses") both point at applying this globally — `/health` and `/docs`
  should get the same headers, not just `/v1`. Unlike CSRF (which is
  meaningless outside cookie-bearing `/v1` mutations), generic headers like
  `X-Content-Type-Options`/`Referrer-Policy`/`frame-ancestors` cost nothing
  on a JSON or Swagger-UI response.
- Real risk: `@fastify/helmet`'s default CSP is strict enough to plausibly
  break `/docs` (Swagger UI, part of the fixed "REST + OpenAPI" stack per
  `.claude/CLAUDE.md` — must not regress it) and its default
  `upgrade-insecure-requests` CSP directive would break local `http://`
  dev entirely (browser silently rewrites `/docs`'s own sub-requests to
  `https://`, which has no listener locally) — this app never terminates
  TLS itself (a reverse proxy does, per ADR-013/CR-075, not yet built), so
  that directive is actively wrong here, not just inconvenient.
- No `@fastify/helmet` dependency currently installed. Latest npm version
  (13.1.1) targets Fastify 5 (this repo's version) — same "adopt latest,
  don't pin below current" pattern every other `@fastify/*` dependency here
  already follows.

## Decision

- Add `@fastify/helmet` (`apps/api`), registered once, globally, in
  `app.ts` — new `apps/api/src/plugins/security-headers.ts`
  (`registerSecurityHeaders`), called early (right after
  `registerErrorHandler`) so it applies to every route registered
  afterward: `/health`, `/docs`, `/v1/*`.
- Custom CSP directives (not helmet's raw defaults): `defaultSrc: ["'self'"]`,
  `styleSrc: ["'self'", "'unsafe-inline'"]` (Swagger UI's own inline styles
  — helmet's own default already includes `'unsafe-inline'` here, not a
  lowered bar), `imgSrc: ["'self'", 'data:']` (Swagger UI's embedded
  logo/favicon), `scriptSrc: ["'self'"]`, `objectSrc: ["'none'"]`,
  `frameAncestors: ["'none'"]` (this API is never meant to be framed —
  stricter than helmet's `'self'` default), `upgradeInsecureRequests: null`
  (explicitly removed — see the dev-breakage reasoning above; TLS
  termination is a reverse-proxy concern this app doesn't own yet).
- `xFrameOptions: { action: 'deny' }` to match `frameAncestors: 'none'` —
  security.md names both together, keep them consistent rather than
  shipping a CSP `frame-ancestors: none` next to a looser
  `X-Frame-Options: SAMEORIGIN`.
- Everything else stays helmet's defaults (`X-Content-Type-Options: nosniff`,
  `Referrer-Policy`, `Cross-Origin-Resource-Policy: same-origin` — consistent
  with ADR-013's no-CORS single-origin posture, `Strict-Transport-Security`
  — harmless over plain http per spec, takes effect once a real reverse
  proxy terminates TLS).
- Live-verify `/docs` still renders and functions after the change (not just
  assumed) — this is the one real regression risk.

## Requirements / acceptance criteria

- `GET /health`, `GET /docs`, and a `/v1/*` response all carry
  `Content-Security-Policy`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Referrer-Policy`.
- `/docs` (Swagger UI) still renders and works with the new CSP — live
  browser check, not just "no server error."
- No `upgrade-insecure-requests` directive (would break local `http://` dev).
- `pnpm turbo run lint typecheck build` and the full `apps/api`/`apps/web`
  test suites stay green.

## Planned files

- `apps/api/package.json` (new dependency).
- `apps/api/src/plugins/security-headers.ts` (new).
- `apps/api/src/app.ts` (registers it).
- `apps/api/src/app.test.ts` or a new test file — header assertions.
- `docs/tasks.md`, `.claude/context/known-issues.md` (KI-022 narrows to just
  CR-058 once this lands), `.claude/context/project-state.md`,
  `docs/changelog.md`.

## Implementation progress

- [x] Install `@fastify/helmet` (`^13.1.1`).
- [x] `security-headers.ts` plugin + wire into `app.ts`.
- [x] Tests (headers present on `/health`/`/v1`/`/docs`, no
      `upgrade-insecure-requests`, `frame-ancestors 'none'`) — 5 new
      assertions.
- [x] Live-verify `/docs` still works (headless-browser check).
- [x] Docs/context updates.

## Validation results

`pnpm turbo run lint typecheck build` — 24/24 tasks clean. `apps/api` full
suite: 283/283 passing (was 278). `apps/web` unaffected (174/174). Live
browser check via the `browser-automation` skill against a real running
`apps/api`: `http://localhost:4000/docs/` renders the full Swagger UI
operations list, zero console errors (no CSP violations), zero failed
requests. `curl -i /docs` confirmed actual header values match the plan
(CSP with `frame-ancestors 'none'`, no `upgrade-insecure-requests`;
`X-Frame-Options: DENY`). Dev server stopped afterward.

## Discovered issues

None new.

## Final result

CR-061 is complete. `@fastify/helmet` is registered globally
(`apps/api/src/plugins/security-headers.ts`) with a custom CSP that drops
`upgrade-insecure-requests` (this app never terminates TLS itself) and
tightens `frame-ancestors`/`X-Frame-Options` to `'none'`/`DENY`. Live-verified
the one real regression risk — `/docs` (Swagger UI) — still renders and
works correctly. This closes Security foundations' second-to-last open item;
only CR-058 (Redis-backed per-account auth rate limiting) remains, blocked on
KI-014. Next logical task: Deployment section (CR-074+), since Security
foundations has no other unblocked work.
