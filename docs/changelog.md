# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

## Archiving (keep this file cheap to read)

When this file exceeds ~15 entries, move all but the most recent ~8 into
`docs/changelog-archive/YYYY.md` (one file per year), preserving order and content exactly,
and update the pointer line below. Routine work reads only the last 3 entries of the
_live_ file (`awk` on `^## 20`, or `tail`) — the archive exists for humans and for deep
audits (grep it by CR id), not for routine agent context. (CR-202 lowered this from ~40/~15.)

## Format

```
## YYYY-MM-DD — CR-XXX — short title
Summary: what changed and why, in 1-3 sentences (≤ ~600 characters).
Contract: API/types/ui contract changes, migrations — or "none".
Files: key files/dirs touched (globs, not every test file).
Validation: commands run + pass counts, one line.
Decisions: link to docs/decisions.md entry if an ADR was created, otherwise "none".
Follow-up: anything deferred, or "none".
```

Detail beyond that (root-cause narratives, live-verification transcripts) belongs in the
commit message body or the KI entry, not here — every agent re-reads these entries.

---

Entries through the CR-250 deploy (CR-000 through CR-250, 2026-09-09..2026-10-13) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02, CR-171..CR-188 on 2026-10-03 by CR-202, CR-190..CR-197 on 2026-10-03 by CR-205, CR-198..CR-204 on 2026-10-06 by CR-213, CR-205..CR-218 on 2026-10-08 by CR-226, CR-219..CR-227 on 2026-10-10 by CR-232, CR-228..CR-233 on 2026-10-12 by CR-239, CR-234..CR-239 on 2026-10-12 by CR-245, CR-240..CR-245 on 2026-10-13 by CR-250, the CR-245 deploy..CR-250 on 2026-10-14 by CR-261),
per this section's own rule.

## 2026-10-14 — CR-251 — Redis command args no longer reach the API log

Summary: ioredis attaches `command: { name, args }` to reply/abort errors and pino logged it whole. BullMQ's `queue.add()` passes the job JSON as an arg, so a Redis error during an enqueue logged the recipient email and the one-time verify/reset link. The API logger now redacts `err.command.args` (also in an error held in a property and in `AggregateError` members) — one app-wide `redact` rule; the command name stays. Reproduced live against Redis before/after. Unisender errors were already redacted (`redactEmails`).
Contract: none.
Files: `apps/api/src/lib/log-redaction.ts` (+ test), `apps/api/src/app.ts`.
Validation: api 770/770 (live Redis/S3, `coffee_ride_test`); `pnpm coverage:check` holds; typecheck, lint (0 errors), prettier.
Decisions: pino `redact`, not a custom `err` serializer — no new dependency, applies to every logger child. Production logs checked: none matching; the CR-250 deploy recreated the container, so nothing to purge.
Follow-up: Dependabot #18 (`braces`, KI-095) has no fix to apply — owner's call on dismissing it.

## 2026-10-14 — CR-252 — Lictor security-audit skills vendored

Summary: the owner asked to adopt the Lictor security suite (github.com/Raffa-jarrl/Lictor-AI). Its four skills are copied unmodified into `.claude/skills/lictor-*` at upstream `cfe8c00` (Apache-2.0, `LICENSE` + `UPSTREAM.md`): a 48-check whole-repo audit, a finding explainer, a guided fixer and a key-rotation runbook. CLAUDE.md routes them and states which project rules override theirs. The audit report `SECURITY-AUDIT.md` is gitignored — the repository is public.
Contract: none (agent tooling only).
Files: `.claude/skills/lictor-{security-check,explain,fix-it,rotate}/`, `.claude/CLAUDE.md`, `.gitignore`, `.prettierignore`.
Validation: all upstream skill files read before vendoring (no hidden text, network calls or telemetry; the only write is the report); `prettier --check .` clean (56 vendored files fail without the ignore); `SECURITY-AUDIT.md` confirmed ignored by `git status`.
Decisions: vendored and pinned, not the plugin marketplace (tracks upstream `main` unpinned); `benchmark/` not copied (GPL-2.0 OWASP corpus, unused by the skill); files kept byte-identical so an update is a diff.
Follow-up: the first `lictor-security-check` run.

## 2026-10-14 — CR-253..CR-258 — Lictor audit findings fixed

Summary: the first `lictor-security-check` (CR-252) found no critical/high issue; the owner asked to fix every finding. CR-253: joining a ride or its waitlist needs a verified email (`403 email_verification_required`, Russian banner + resend button). CR-254: an admin-hidden ride's reviews 404 for non-owners; `Review` drops `userId`. CR-255: per-user upload tier, 10/min. CR-256: auth events logged with the user id. CR-257: logout clears `__Host-session` with `Secure` (KI-099). CR-258: base images pinned by digest.
Contract: `POST /v1/rides/:id/register`/`waitlist` +`403 email_verification_required`; `GET /v1/rides/:id/reviews` +404 for a hidden ride, `Review.userId` removed (also `viewerReview`); upload `POST`/`PATCH` +`429 upload_rate_limited`. `docs/api.md` updated.
Files: `registrations.service.ts`, `reviews.{service,routes}.ts`, `lib/upload-rate-limit.ts`, `lib/auth-events.ts`, `auth/session-cookie.ts`, auth/google/rides/users/organizers routes, `RegistrationTicket.tsx` (+story), `terminology.ts`, `types/domain/review.ts`, 3 Dockerfiles.
Validation: `pnpm test:coverage` with live Redis/S3 (`coffee_ride_test`) green and `pnpm coverage:check` holds; typecheck, lint, format, build; storybook 298/303 — the 5 failures are on clean `main` too (KI-100).
Decisions: the email gate sits after the idempotent replay (CR-083 keeps `200`); the upload tier is a second gate keyed by user, so the per-IP default still covers anonymous calls; Dockerfiles pinned, compose images not (no Dependabot coverage for them yet).
Follow-up: KI-097 (nonce CSP) needs the owner's ADR call; restrict the 2GIS MapGL key to the domain in the 2GIS cabinet (owner).

## 2026-10-14 — CR-259 — Page CSP by per-request nonce (ADR-036, KI-097)

Summary: owner chose the nonce route for KI-097, the last open Lictor finding. `apps/web/src/proxy.ts` sets the page CSP per request: scripts by `'nonce-…' 'strict-dynamic'`, no `'unsafe-inline'`; Next stamps the nonce on its scripts, the root layout passes it to the theme script and reads `headers()`, so every page renders per request. MapGL (loaded via `createElement`) works under `'strict-dynamic'`. Other headers stay in `next.config.ts`.
Contract: none (page headers only; the API's helmet CSP unchanged).
Files: `src/proxy.ts` (+test), `lib/security/headers.ts` (+test), `app/layout.tsx`, `next.config.ts`, `e2e/security-headers.spec.ts`, ADR-036, rules `do-not-break`/`security`.
Validation: web unit 944/944 with coverage (web above baseline); typecheck, lint, `lint:root`, `format:check`, `next build` (all pages `ƒ`); e2e `security-headers.spec.ts` 4/4 (isolated dev servers); production build on :3100 in Chromium: `/`, `/?view=map` (MapGL tiles + canvas), `/login`, `/register`, a ride 404 — zero `securitypolicyviolation`.
Decisions: `style-src` keeps `'unsafe-inline'` (a nonce would block `style` attributes); `'self'`/MapGL host/`blob:` kept as the pre-`strict-dynamic` fallback; prefetches skip the proxy.
Follow-up: deploy; re-run `lictor-security-check`.

## 2026-10-14 — CR-251, CR-253..CR-259 deployed

Deploy: `ca19f6d` (PR #61, squash; includes PR #58 and #60) on coffeeride.site via `deploy/deploy.sh` after green CI on the PR (ci, docker-smoke) and on `main`. No migration. After: API `/health` db/redis/s3 ok, `/`, `/login`, `/?view=map`, `/api/v1/rides` `200`; page CSP carries a fresh nonce + `'strict-dynamic'`, every `<script>` on `/` has it; Chromium on `/?view=map`: MapGL renders, zero `securitypolicyviolation`; no level ≥50 API log lines in the first 5 minutes. Unverified accounts now get `403 email_verification_required` on joining a ride (existing registrations kept).

## 2026-10-14 — CR-260 — Yandex ID sign-in beside Google (ADR-037)

Summary: «Войти через Яндекс» on `/login` and `/register` (keeps `next`): OAuth 2.0 code flow with PKCE S256 + `state` (signed 10-min `yandex-oauth` cookie), profile from `login.yandex.ru/info`, ordinary DB session; no Yandex token kept. Identity = Yandex `id`; a present `default_email` counts as verified. Google's linking became the shared `signInWithOAuth` (link verified / claim unverified / refuse blocked, race-safe). One button block for both providers.
Contract: `GET /v1/auth/yandex`, `/yandex/callback`, `/yandex/status` (new); failures → `/login?oauth=<outcome>&provider=yandex`; `types` `YANDEX_SIGN_IN_OUTCOMES`, `OAUTH_OUTCOME_PROVIDER_PARAM`; `ui` `YANDEX_SIGN_IN_TERMS`, `OAUTH_SIGN_IN_TERMS` (divider/consent moved out of `GOOGLE_SIGN_IN_TERMS`). Env `YANDEX_CLIENT_ID`/`_SECRET` (optional). No migration, no new dependency.
Files: `apps/api/src/modules/auth/{yandex-client,yandex.routes}.ts` + tests, `oauth-sign-in.service.ts` (was `google.service.ts`), `oauth-transaction.ts` (was `google-transaction.ts`), `plugins/yandex.ts`, `test-support/fake-yandex.ts`, `env.ts`, `preflight.ts`; `apps/web/src/features/auth/oauth` (was `auth/google`), login/register pages, `OAuthSignIn.stories.tsx`, legal texts (edition 2026-10-14); env examples, `docker-compose.prod.yml`; ADR-037, docs, rules.
Validation: `test:coverage` with live Redis/S3 on a private test DB — api 829/829 (0 skipped), web 948/948, ui 281/281, db 17, resilience 15, maps-2gis 82 (+6 opt-in); `coverage:check` holds (auth +2.36 pp lines); format:check, lint:root, lint, typecheck, build green; Storybook `OAuthSignIn` 6/6 with axe; isolated dev servers (:3200/:4200): start → `303` to `oauth.yandex.ru` with PKCE/state, forged callbacks → «expired»/«state» alerts, 390 px dark screenshot.
Decisions: no OIDC for Yandex (none offered) — the profile read over TLS from Yandex is the identity; HMAC label per provider (Google's kept); Yandex button first (Russian audience).
Fixed on the way: the OAuth callbacks' `logLevel: 'warn'` dropped their `info` auth event, so no `google_sign_in` line was ever written since CR-256; both now log via `app.log` with `reqId` (`logAuthEvent`'s optional 4th arg), asserted in both route suites.
Live: the owner's real Yandex ID app (local `.env`) — a real sign-in created a verified, password-less user + a `yandex` identity (numeric id) and one session; no token/code in the dev log.
Follow-up: ships with CR-261 in one PR; production needs the redirect URI `https://coffeeride.site/api/v1/auth/yandex/callback` and the two env vars on the VPS.

## 2026-10-14 — CR-261 — reCAPTCHA v2 on password auth + «Повторите пароль» (ADR-038)

Summary: owner request. Register, password login and forgot-password take a Google reCAPTCHA v2 token, verified only by the API (`siteverify` via `packages/resilience`: 5 s, no retry, breaker) after both rate-limit tiers: `400 captcha_required`/`captcha_invalid`, `503 captcha_unavailable` (fails closed, ADR-038). Keys optional (`RECAPTCHA_SECRET_KEY`, `NEXT_PUBLIC_RECAPTCHA_SITE_KEY`); Google's test secret refused in production. Register gets «Повторите пароль», checked in the browser, never sent. OAuth untouched.
Contract: `register`/`login`/`forgot-password` + optional `captchaToken` and three `captcha_*` codes (`types`' `CAPTCHA_ERROR_CODES`); `ui` `CAPTCHA_TERMS`, `AUTH_TERMS.confirmPasswordLabel`/`passwordsMismatch`; page CSP + Google reCAPTCHA paths. `docs/api.md` updated.
Files: api `env.ts`, `preflight.ts`, `plugins/recaptcha.ts`, `modules/auth/recaptcha-client.ts`, `auth.routes.ts` (+tests); web `features/auth/captcha/*`, Register/Login/ForgotPassword forms (+tests), `lib/security/headers.ts`, `AuthCaptcha.stories.tsx`, `playwright.config.ts`, `e2e/login-return.spec.ts`; Dockerfile, prod compose, smoke env, env examples.
Validation: `pnpm test:coverage` with live Redis/S3 (`coffee_ride_test`) green, `coverage:check` holds (api auth +2 pp); lint, `lint:root`, typecheck, build; storybook `AuthCaptcha`+`FormErrors` 21/21 with axe; e2e (see current-task); Chromium on dev :3200/:4200 with Google's test keys: real widget, zero CSP violations, 320/390/1440, light/dark.
Decisions: fail closed (the widget depends on Google anyway); `bad-request` = invalid token, only secret errors are 503; reset-password not gated (single-use emailed token).
Follow-up: owner creates the key pair for coffeeride.site and adds reCAPTCHA to the privacy policy; deploy needs a web rebuild.

## 2026-10-14 — CR-262 — `/register` to the auth mockup; no account enumeration on register (ADR-039)

Summary: owner request with the auth mockup package (`reference/coffee-ride-auth-mockup`, tab «Регистрация»). `/register` gets the story panel (`lg`+), Google/Yandex ID first as equal «Продолжить с …» buttons, «или создайте пароль», a strength meter (words + 4 segments, advisory; the rule stays 12+), a live match line and show/hide toggles. `confirmPassword` is checked by the browser and the API. A taken email now gets the same `201` and body as a new one; its owner an «Аккаунт уже есть» email.
Contract: `register` body + `confirmPassword?` (must equal `password`); response `{ emailVerificationRequired, verificationUrl? }` — no `user`, no `409 email_already_registered` (breaking for callers reading `user`: web + tests updated). Notification job `account_exists_email`; auth event `register_existing_email`. `ui`: `PasswordInput`, `REGISTER_PAGE_TERMS`, `PASSWORD_TERMS`, `*_SIGN_IN_TERMS.continueButton`, `AUTH_TERMS.emailPlaceholder`/`registerSuccessTitleVerified`; `registerSuccessBody` is a function; `emailAlreadyRegistered`, `loginLink` removed. No env var, no migration, no dependency.
Files: types `api/auth.ts`; api `auth.service.ts`, `auth.routes.ts`, `lib/auth-events.ts`, notifications service/queue (+tests); ui `PasswordInput`, `terminology.ts` (+tests); web `(public)/register/page.tsx` (+test), `features/auth/{layout,password}/*`, `RegisterForm`, `OAuthSignIn` (`intent`), marks, `RegisterScreen.stories.tsx`, e2e fixture; ADR-039, `api.md`, `auth.md`, rules.
Validation: format:check (only the untracked mockup file differs), lint (warnings unchanged 8/29), lint:root, typecheck, build 7/7; tests api 884/884 with live Redis/S3, web 999, ui 293, db 17, resilience 15, maps-2gis 82; `coverage:check` holds (api auth +3.06 pp lines, +8.40 branches); Storybook 41/41 with axe; e2e `login-return` + `critical-journeys` 7/7; Chromium against the real API with fake Google/Yandex/siteverify: 24/24 (320/390/768/1440, light/dark, success, taken email, mismatch, short/weak, captcha required/invalid/expired, Google/Yandex with safe `next`, unsafe `next`).
Decisions: confirmation optional in the schema (older callers keep working), the web form always sends it; the meter only advises; Google first as in the mockup on `/register` (login keeps Yandex first); form column 30.5rem so «Продолжить с Яндекс ID» stays on one line.
Fixed on the way: `isUniqueViolation` missed drizzle 0.45's wrapped `23505` (the error is the `cause`), so a concurrent register race answered 500.
Follow-up: `/login` and the maintenance screen from the same mockup (owner's next prompts); KI-101 (same wrapped-`23505` miss in reviews/ride-groups/organizers), KI-102 (EditRideForm test flaky under coverage load).

## 2026-10-14 — CR-263 — `/register` story column: text only

Summary: owner request on a screenshot of CR-262's `/register`: drop the story panel's background and keep only its headline and body. `AuthSplitLayout`'s `aside` loses the surface fill, the right border and the decorative abstract route (SVG deleted); the text now sits on the page background, still only from `lg`.
Contract: none.
Files: web `features/auth/layout/AuthSplitLayout.tsx`.
Validation: web typecheck, eslint, vitest auth + register 121/121, Storybook `RegisterScreen` 6/6 with axe; Chromium 1440 light/dark against the dev stack — `aside` background transparent, no border, no SVG.
Decisions: deliberate departure from the mockup's panel (owner).
Follow-up: none.

## 2026-10-14 — CR-262, CR-263 deployed

Deploy: `c53271b` (PR #64, squash of `experiments`' CR-262/CR-263 rebased on `main`; CR-260/CR-261 were already live at `146ff5d`, PR #63) on coffeeride.site via `deploy/deploy.sh` after green CI on the PR (ci, docker-smoke) and on `main`. No migration, no env change. Before: format, lint, typecheck, build, api 884, web 999 (KI-103 workaround), coverage gate, e2e 56 + Linux baselines in CI. After: API `/health` db/redis/s3 ok; `/`, `/register`, `/login`, `/forgot-password` `200`; Chromium on `/register` and `/login`: new register layout, reCAPTCHA renders, zero `securitypolicyviolation`; no level ≥50 API log lines in the first 10 minutes. A taken email on `/register` now emails its owner (email is live in production).

## 2026-10-14 — CR-264 — `/login` to the auth mockup; social sign-in checks re-proven

Summary: owner request (mockup tab «Вход»). `/login` moves into CR-262/263's frame: story text (`lg`+), «Выберите быстрый вход…», Google then Yandex ID as equal buttons («Войти через Google», «Войти с Яндекс ID»), «или через email», the form without a card (placeholders, «Забыли пароль?» on the «Пароль» line, show/hide), «Нет аккаунта? Зарегистрироваться», the consent line. No auth logic changed: the existing Yandex/Google flows already met the brief; new tests pin the gaps.
Contract: `ui` `FormField.labelAction?` (new optional prop), `LOGIN_PAGE_TERMS`, `AUTH_TERMS.passwordPlaceholder`; `YANDEX_SIGN_IN_TERMS.button` → «Войти с Яндекс ID»; removed `AUTH_TERMS.registerLink`, `OAUTH_SIGN_IN_TERMS.divider`. `OAuthSignIn` renders only the buttons (pages own divider/consent). API: none. No migration, no env var.
Files: ui `FormField.tsx`, `terminology.ts` (+tests); web `(public)/login/page.tsx` (+test), `features/auth/login/components/{LoginScreen,LoginForm}.tsx`, `OAuthSignIn.tsx`, auth tests, `LoginScreen`/`OAuthSignIn` stories, e2e `helpers/ui.ts`, `login-return`, `password-reset`; api `yandex.routes.test.ts`; `coverage-baseline.json`.
Validation: format:check (only the untracked mockup differs), lint, lint:root, typecheck, build 7/7; `test:coverage` with live Redis/S3 — api 886, web 1011, ui 298, db 17, resilience 15, maps-2gis 82 (+6 opt-in); `coverage:check` holds, baseline raised; Storybook auth stories 56/56 with axe; e2e `login-return`, `password-reset`, `critical-journeys` 9/9; Chromium on the dev stack with mock provider ids: 1440/768/390/320 no overflow, Yandex/Google start → S256 + state (+ nonce for Google), cookie HttpOnly/Lax/600 s, forged state → «state», no cookie → «expired», unsafe `next` dropped, wrong password → generic, right → `/me`.
Decisions: Google first on `/login` too (mockup; reverses CR-262's note); reCAPTCHA stays on password login (ADR-038) though the mockup shows none; story column text-only as CR-263; Yandex keeps no nonce (no ID token, ADR-037).
Follow-up: the maintenance screen (owner's prompt 3).
