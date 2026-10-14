# Current task — CR-260 + CR-261 — Yandex ID sign-in and reCAPTCHA v2, one PR

Source: owner, 2026-10-14. Both tasks were built in parallel sessions
(`feat/yandex-oauth`, `feat/recaptcha-confirm-password`) and joined on
`feat/yandex-oauth-recaptcha` (worktree `../coffeeride-combined`, off `ec36c0c`); the
owner chose one PR into `main` and kept ADR-038's fail-closed mode.

## Integration

- Conflicts resolved in `env.ts`, `preflight.ts`, `app.ts`, `terminology.ts`,
  `.env.example`, `deploy/production.env.example`, `docker-compose.prod.yml`, docs and
  context; ADR-037 and ADR-038 in order in `docs/decisions.md`.
- `recaptcha.routes.test.ts` also asserts `GET /v1/auth/yandex` is ungated.
- Validation of the joined tree: see "Integration validation" below.

## CR-261 — reCAPTCHA v2 on password auth + «Повторите пароль» (ADR-038)

Source: owner, 2026-10-14. Branch `feat/recaptcha-confirm-password` (worktree
`../coffeeride-recaptcha`). No commit/push (owner). CR-260/ADR-037 are taken by the
parallel Yandex ID session (`feat/yandex-oauth`).

### Goal

Google reCAPTCHA v2 («Я не робот») on register, password login and forgot-password,
verified only server-side (Google `siteverify`); a confirm-password field on register.

### Requirements

- API: `RECAPTCHA_SECRET_KEY` (env schema, optional — unset = check off, preflight
  warns); `captchaToken` on register/login/forgot-password bodies; checked after both
  rate-limit tiers, before the service. Missing → `400 captcha_required`; `success:false`
  (invalid/expired/duplicate) → `400 captcha_invalid`; Google down/slow/5xx/breaker open
  → `503 captcha_unavailable` (fail closed). Secret/token never logged or returned.
  OAuth routes untouched. Reset-password (single-use emailed token) not gated.
- Web: `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (build-time); explicit-render widget, ru, theme;
  client blocks submit without a token; any failed submit resets the widget; Russian
  messages via terminology; CSP allows Google's reCAPTCHA hosts.
- Register: «Повторите пароль» — mismatch/empty shown at the field before submit;
  only `password` sent.
- Docker: web build arg, prod compose (web arg + api env), smoke env,
  `.env.example`, `deploy/production.env.example`.
- Keep design, a11y, safe-next, rate limits, generic auth errors.

### Acceptance

API tests: success, missing/invalid/expired token, Google unavailable (5xx, network,
timeout), disabled = no check, OAuth unaffected. Web tests: mismatch, success sends no
`confirmPassword`, captcha required/reset/error messages. Storybook stories. Live check
in a browser with Google's test keys. lint, typecheck, tests, build green.

### Planned files

api: `env.ts`, `preflight.ts`, `plugins/recaptcha.ts`, `modules/auth/recaptcha-client.ts`
(+test), `auth.routes.ts` (+test), `app.ts`. types: `api/auth.ts`. ui: `terminology.ts`.
web: `features/auth/captcha/*`, Register/Login/ForgotPassword forms (+tests, stories),
`lib/security/headers.ts`, Dockerfile. Docs: ADR-038, `docs/api.md`, rules.

### Progress

API, types, ui terms, web widget + forms, CSP, Docker/env, docs (ADR-038, api.md,
rules, architecture map), close-task — done.

### Validation results

- api: `recaptcha-client.test.ts` 19, `recaptcha.routes.test.ts` 22 (real routes + DB,
  fake Google: success, missing/invalid/expired, Google 503/network, breaker, rate
  limits first, OAuth and token routes ungated, off without secret), env/preflight.
- web: auth features 99 (mismatch, empty confirm, body without `confirmPassword`,
  captcha required/sent/refused/reset/expired, widget loader/Strict Mode/compact/dark).
- `pnpm test:coverage` (live Redis/S3, `coffee_ride_test`) + `coverage:check` holds;
  lint, `lint:root`, typecheck, `format:check`, `pnpm build`.
- Storybook full: 307/312 — the 5 failures are KI-100 (Admin*, pre-existing).
- e2e on :3200/:4200: login-return, password-reset, critical-journeys,
  security-headers 13/13; uploads/start-time 10/10 with S3; full run 52/69 — the rest
  were visual specs (Linux-only baselines; macOS has none) and uploads without S3.
- Live: dev servers with Google's test keys, real `siteverify` from this machine; curl
  on the API (400 `captcha_required`, test-key pass, generic `invalid_credentials`,
  204 forgot); Chromium 320/390/1440 light/dark: real widget, compact at 320, zero
  CSP violations, no horizontal scroll, widget reset after a failure, register body
  keys `captchaToken,email,password`; secret/token absent from API logs.
- Not run: `docker-smoke` (CI), visual baselines (screens untouched).

### Discovered issues

- `bad-request` from siteverify reclassified as an invalid token (caller-provokable).
- Google's public test secret refused at boot in production.
- Response `hostname` not checked (ADR-038: keep the key's origin verification on).

### Final result

Done and validated locally on its own branch; shipped through the integration branch.

## CR-260 — Yandex ID sign-in (ADR-037)

Source: owner, 2026-10-14. Branch `feat/yandex-oauth` (worktree `../coffeeride-yandex`).
Owner: no commit/push.

### Goal / requirements

«Войти через Яндекс» on `/login` and `/register` on the Google (CR-247) pattern:
server-side Authorization Code Flow with PKCE + `state`; `YANDEX_CLIENT_ID`/`_SECRET`;
`GET /v1/auth/yandex?next=`, `GET /v1/auth/yandex/callback`; rights
`login:info login:email`; profile via the Yandex ID API; `auth_identities`
provider `yandex` + stable Yandex `id`; atomic linking by a confirmed email, else a new
user; the existing session cookie; no Yandex tokens stored; protected callback, safe
`next`, race-safe linking; env schema, `.env.example`, tests; lint/typecheck/test/build.

### Acceptance

- [x] start → `303` to `oauth.yandex.ru/authorize` with S256 challenge, state, both
      rights, exact redirect URI; signed `yandex-oauth` cookie (`__Host-` in prod).
- [x] callback: cookie cleared every time; state checked before anything else;
      replay/forged/expired/Google cookie refused; decline → `cancelled`.
- [x] new user verified + password-less; returning by Yandex id; verified account
      linked; unverified claimed (ADR-035); blocked refused; no email refused.
- [x] races: one user + one identity (Yandex×6, Google+Yandex same email).
- [x] no token in DB/log; unsafe `next` dropped.
- [x] env schema + preflight pair check, `.env.example`, prod example, compose.
- [x] lint, typecheck, test (coverage gate), build.

### Validation results

`test:coverage` with live Redis/S3, TEST_DATABASE_URL=`coffee_ride_test_yandex`
(private DB — the shared `coffee_ride_test` held another session's rows): api 829/829,
0 skipped; web 948/948; ui 281/281; db 17; resilience 15; maps-2gis 82 (+6 opt-in).
`coverage:check` holds (auth 98.39 % lines, +2.36 pp). format:check, lint:root, lint
(0 errors; warnings pre-existing, none in touched files), typecheck, build (7/7).
Storybook `OAuthSignIn.stories.tsx` 6/6 with axe. Browser on isolated :3200/:4200:
both buttons + one consent line on /login and /register; forged callbacks show the
Yandex «expired»/«state» lines; 390 px dark screenshot checked.
Not run: e2e suite, docker-smoke (CI).
Live with the owner's Yandex ID app (2026-10-14, branch on :3000/:4000, dev DB): real
sign-in → user verified/password-less, `yandex` identity (numeric id), 1 session; no
token/code in the log. It exposed a defect: `logAuthEvent(request.log, …)` on the
`logLevel: 'warn'` callbacks never wrote `google_sign_in`/`yandex_sign_in` — fixed via
`app.log` + `reqId`; auth suites 159/159 (+3 live-Redis skipped), typecheck/lint ok.

### Final result

Done on `feat/yandex-oauth`; shipped through the integration branch. Live sign-in with
the owner's Yandex ID app passed.

## Integration validation

On the joined tree (2026-10-14): `format:check`, `lint:root`, `lint` (0 errors),
`typecheck`, `pnpm build` (7/7); `test:coverage` with live Redis/S3 on
`coffee_ride_test` — api 876/876, web 975/975, ui 285, db 17, resilience 15, maps-2gis
82 (+6 opt-in); `coverage:check` holds (auth 98.51 % lines, +2.48 pp); Storybook
309/314 (the 5 failures are KI-100, pre-existing); e2e on :3200/:4200 57/69 — the 12
failures are the visual specs only (Linux-only baselines, compared in CI). Live on the
joined stack: both OAuth `status` → `available:true`, login without a token → `400
captcha_required`, `/auth/yandex` → `303`, widget + both buttons in Chromium, 0 CSP
violations. Not run locally: `docker-smoke` (CI).

## Final result

Committed on `feat/yandex-oauth-recaptcha`; PR into `main`.
