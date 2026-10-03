# Current task — CR-205: security audit fixes — DONE (committed)

Source: owner — "нужно проверить наш проект на безопасность" → audit (security-review
skill, whole app) → "исправь проблемы". Branch `main`.

## Goal

Fix the audit's findings 1–4; finding 5 (register 409 enumeration / per-account
lockout) is an accepted trade-off — recorded, not changed.

1. GPX download `Content-Disposition` built from the raw uploaded filename: a Cyrillic
   name → 500 `ERR_INVALID_CHAR` (reproduced), a `"` injects header parameters.
2. Web HTML pages ship no security headers (no frame-ancestors/X-Frame-Options, HSTS,
   nosniff, Referrer-Policy; `X-Powered-By: Next.js`).
3. Dependencies: fastify <5.12.5, `ip-address` via `@fastify/rate-limit`; Dependabot
   alerts disabled on the GitHub repo.
4. Single-use token TOCTOU: `resetPassword`/`verifyEmail` check `usedAt` before the
   transaction and never check the guarded UPDATE's row count.

## Acceptance criteria

- Download of a route uploaded as `маршрут.gpx` returns 200 with an ASCII `filename`
  fallback + RFC 5987 `filename*=UTF-8''…`; a `"`/`;`/CR-LF in the name can't add
  parameters. Covered by a route test.
- Every web response carries the security headers; `X-Powered-By` gone; no CSP that
  breaks 2GIS MapGL / Next inline scripts (CSP left out deliberately unless verified).
- `pnpm audit --prod` no longer lists fastify / ip-address advisories reachable at
  runtime; remaining ones documented.
- Two concurrent resets/verifies with one token: exactly one succeeds. Tests.
- typecheck, lint, affected unit tests green.

## Planned files

- `apps/api/src/modules/rides/rides.routes.ts` (+ helper, test)
- `apps/web/next.config.ts`
- `apps/api/src/modules/auth/auth.service.ts` (+ test)
- `apps/api/package.json`, `pnpm-lock.yaml`
- `.claude/rules/security.md` (web headers line)

## Progress

- [x] 1 Content-Disposition (`lib/content-disposition.ts`)
- [x] 2 web headers (`next.config.ts` `headers()`, `poweredByHeader: false`)
- [x] 3 fastify 5.12.5, ip-address/fast-uri/brace-expansion in-range; Dependabot
      alerts enabled via `gh api -X PUT …/vulnerability-alerts` (204)
- [x] 4 token TOCTOU (guarded claim inside the transaction)
- [x] validation
- [x] close-task

## Validation results

- api vitest: 41 files, 599 passed / 8 skipped; the reset concurrency test fails on
  HEAD's `auth.service.ts` (4×200), passes now. The verify-email one passes on both
  (no argon2 delay → no interleave locally) — kept as a guard.
- turbo typecheck+lint (api, web): 17/17. Prettier clean.
- e2e chromium: security-headers 2/2; home, critical-journeys, gpx-route,
  password-reset 11/11 (dev servers on :3000/:4000 reused).
- `pnpm audit --prod`: 16 → 4 (all postcss via Next 15 → KI-090).

## Discovered issues

- KI-090: Next 15 pins postcss 8.4.31; fixed only by Next 16.

## Final result

Done, committed and pushed. Changelog entry CR-205; changelog archived (CR-190..CR-197).
