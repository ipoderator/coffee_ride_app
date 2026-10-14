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

Entries through CR-262 (CR-000 through CR-262, 2026-09-09..2026-10-14) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02, CR-171..CR-188 on 2026-10-03 by CR-202, CR-190..CR-197 on 2026-10-03 by CR-205, CR-198..CR-204 on 2026-10-06 by CR-213, CR-205..CR-218 on 2026-10-08 by CR-226, CR-219..CR-227 on 2026-10-10 by CR-232, CR-228..CR-233 on 2026-10-12 by CR-239, CR-234..CR-239 on 2026-10-12 by CR-245, CR-240..CR-245 on 2026-10-13 by CR-250, the CR-245 deploy..CR-250 on 2026-10-14 by CR-261, CR-251..CR-262 on 2026-10-15 by CR-267),
per this section's own rule.

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

## 2026-10-14 — CR-264 deployed

Deploy: `92ffe50` (PR #66, squash of `experiments`' `cbf5e95` rebased on `main` + `dbdac72`) on coffeeride.site via `deploy/deploy.sh` after green CI on the PR (ci, docker-smoke) and on `main`. No migration, no env change. CI's coverage gate first failed on `packages/ui` (99.61/94.05 vs the raised 99.73/94.22): `offsetMinutes`' bare-`GMT` fallback is reached only on ICU < 78, where the cloud session measured it; `dbdac72` pins that fallback with a test (99.74/94.22 on any ICU, baseline unchanged). After: API `/health` db/redis/s3 ok; `/`, `/login`, `/register`, `/forgot-password` `200`; Chromium on `/login` and `/register`: new layout, reCAPTCHA renders, zero `securitypolicyviolation`; no level ≥50 API log lines in the first 10 minutes.

## 2026-10-14 — CR-262 follow-up — the register race covered deterministically

Summary: `main`'s CI after the docs-only #67 failed the coverage gate (`apps/api/src/modules/auth/` −1.08 pp lines): `registerUser`'s unique-violation branch (`findExisting` on 23505, `isUniqueViolation`'s `cause` check) ran only when the five-concurrent-registrations test happened to race. A new test holds the email in an open transaction, waits until the route's insert blocks on `users_email_unique` (`pg_stat_activity`), then commits — the branch runs every time.
Contract: none.
Files: api `modules/auth/auth.routes.test.ts`.
Validation: the new test 3/3 alone, lines 165–167/531–535 covered; format, api lint/typecheck; `test:coverage` with live Redis/S3 — api 887, web 1011, ui 299; `coverage:check` holds.
Decisions: test-only; the baseline stays.
Follow-up: none.

## 2026-10-14 — CR-265 — Maintenance mode, the unexpected-error state, a static fallback at Caddy (ADR-040)

Summary: owner request (mockup tab «Техработы»). `MAINTENANCE_MODE=true` on `web`/`api` (runtime, no rebuild): every page → 503 + `Retry-After` + `no-store` + `noindex` with «Технический пит-стоп» (wordmark, text, «Обновить страницу», «Написать нам», status line; no line/points/illustration), no header; `/v1/*` → 503 `maintenance`, `/health` and provider callbacks stay up. `app/error.tsx`/`global-error.tsx` show the same frame, never the error. Caddy serves a self-contained 503 page when `web` is down.
Contract: API `503 maintenance` on `/v1/*` (docs/api.md); env `MAINTENANCE_MODE`, `MAINTENANCE_RETRY_AFTER_SECONDS` (default 600) on `web`+`api` in `docker-compose.prod.yml`; `ui` `SYSTEM_STATUS_TERMS`; proxy matcher no longer skips prefetches. No migration.
Files: api `env.ts`, `plugins/maintenance.ts` (+test), `routes/v1.ts`; web `proxy.ts` (+test), `app/{layout,error,global-error}.tsx`, `app/maintenance/page.tsx`, `components/site/SystemStatusScreen.tsx`, `lib/site/{maintenance,contact}.ts`, legal `content.ts`, tests, story; ui `terminology.ts` (+test); `deploy/{Caddyfile,MAINTENANCE.md,maintenance/index.html,FIRST-DEPLOY.md,production.env.example}`, `.env.example`, `turbo.json`, `docs/{api,deployment,decisions}.md`, `coverage-baseline.json`.
Validation: format:check (only the untracked mockup differs), lint, lint:root, typecheck, build 7/7; `test:coverage` with live Redis/S3 — api 916, web 1062, ui 300, db 17, resilience 15, maps-2gis 82 (+6 opt-in); `coverage:check` holds, baseline raised; Storybook 326/331 (the 5 are KI-100, same on HEAD), new stories 4/4 with axe; e2e `critical-journeys`, `login-return`, `password-reset`, `themes` 13/13; `caddy validate`/`fmt` + a local Caddy: web down → static 503, web's 503 passes; Chromium on dev and on `next start`: 1440/768/390/320 both themes no overflow, Tab → refresh → mailto, Enter reloads, no leaks/console errors; flag flipped with a tab open → client nav lands on the screen (503), off → refresh back to 200.
Decisions: env flag over a file flag (container recreate covers the gap with the static page); callbacks exempt per the brief; status dot kept (status indicator in the mockup, not decoration); display size from the role scale (52px, mockup 64px); the app's `Wordmark` instead of the mockup's simplified mark.
Follow-up: production run of `deploy/MAINTENANCE.md`; Caddy must be recreated once for the new mount.

## 2026-10-15 — CR-266 — CI split into parallel jobs

Summary: owner request — CI took ~12 min, its one `ci` job running format/lint/typecheck, unit tests with coverage (~5 min), build and e2e (~4 min) in sequence. Now three parallel jobs: `unit` (services, migrations, `test:coverage`, coverage gate), `checks` (format, lint, typecheck, build — no services), `e2e` (services, migrations, Playwright). A gate job named `ci` (`needs` all three, `if: always()`) fails unless each succeeded, so branch protection's required check is unchanged. PR #70's run: 4 min 56 s.
Contract: none (workflow only; required checks still `ci`, `docker-smoke`).
Files: `.github/workflows/ci.yml`; skills `ci-triage`, `visual-baselines` (job names).
Validation: actionlint 1.7.12 clean; prettier; PR #70 — unit 4:47, checks 2:19, e2e 3:52, docker-smoke 3:36, ci gate green.
Decisions: gate job with `always()` — a required check skipped after a failed `needs` would count as passed; services/env/setup steps shared by YAML anchors; e2e no longer waits for `pnpm build` (it runs `next dev`).
Follow-up: CR-267 — `apps/api` tests in parallel (one DB per worker), the `unit` job is now the longest.

## 2026-10-15 — CR-267 — `apps/api` test files in parallel, one database per worker

Summary: owner request (CI speed-up, point 2). The api suite ran file by file (`fileParallelism: false`) because every file wipes whole tables on one shared database — ~4:50 of the `unit` job. Now a Vitest globalSetup clones TEST_DATABASE_URL's migrated database once per worker (`<name>_w<VITEST_POOL_ID>`, `CREATE DATABASE … TEMPLATE`, re-cloned every run), `getTestDatabaseUrl()` points each worker at its copy, and a setupFile gives each worker its own Redis logical database. Locally 917 tests in ~85–100 s with 3 workers.
Contract: none (test infrastructure only).
Files: api `vitest.config.ts`, `test-support/{test-database-url,worker-databases,worker-redis}.ts`; tests `auth/{auth.routes,google.routes,yandex.routes,session}`, `users/avatar.routes`.
Validation: api typecheck, lint (0 errors), format; `vitest --sequence.shuffle` with 3 workers, seeds 11/77/888/9 — 917/917 each; full `test:coverage` with live Redis/S3 + `coverage:check` — holds.
Decisions: parallelism exposed order/timing dependencies, fixed at the root: four auth files deleted `users` without `rides` first (FK from leftover rides); Google held-race tests slept 150 ms instead of polling `pg_stat_activity` for the lock wait (now scoped to `current_database()`, as is #68's register race); the avatar live-Redis test now clears sign-in limiter keys like CR-058's block. `testTimeout` 15 s (slowest ~1 s alone; 5 s was exceeded under a full parallel turbo run); workers ≤ 15 (Redis databases 0..15).
Follow-up: none.

## 2026-10-15 — CR-267 follow-up — Escape on a just-opened dialog retried in two organizer tests

Summary: `main`'s CI after #71 failed one web unit test (`rides.test.tsx`, «without a route saves before asking; dismissing keeps the saved draft»): `Dialog` binds Escape in a passive effect, and the test pressed Escape as soon as the dialog was in the DOM — under the busier `unit` job (api files now in parallel beside web) the effect had not run yet. Both such tests in the file now retry Escape inside `waitFor`, as admin reviews already does.
Contract: none.
Files: web `features/organizer/rides/rides.test.tsx`.
Validation: the file 94/94, and 3× under artificial CPU load (10 × `yes`) — 94/94 each; prettier.
Decisions: test-only; `Dialog` unchanged (binding in an effect is correct for the app). Resolves KI-102 (moved to the archive).
Follow-up: none.
