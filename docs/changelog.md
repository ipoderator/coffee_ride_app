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

Entries before the CR-245 deploy (CR-000 through CR-245, 2026-09-09..2026-10-12) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02, CR-171..CR-188 on 2026-10-03 by CR-202, CR-190..CR-197 on 2026-10-03 by CR-205, CR-198..CR-204 on 2026-10-06 by CR-213, CR-205..CR-218 on 2026-10-08 by CR-226, CR-219..CR-227 on 2026-10-10 by CR-232, CR-228..CR-233 on 2026-10-12 by CR-239, CR-234..CR-239 on 2026-10-12 by CR-245, CR-240..CR-245 on 2026-10-13 by CR-250),
per this section's own rule.

## 2026-10-12 — CR-245 deployed

Deploy: `b19a89a` (PR #46, squash) on coffeeride.site via `deploy/deploy.sh` after green CI on `main` (ci incl. e2e, docker-smoke); no migrations. `/health` db/redis/s3 ok; `/`, `/register?next=…`, `/login`, `/me/rides`, `/verify-email` 200. The emailed-link `next` itself is checked by the next real registration (no test account was created on production).

## 2026-10-13 — CR-246 — Strava sync: cancel, expired state, retry copy (production QA)

Summary: QA: «Отменить» on Strava's screen showed «Strava не дала доступ…» (the callback mapped `error=access_denied` to `denied`); after a check the button stayed «Connect with Strava» with no sign of what happened (the grant is one-shot by ADR-033, so Strava always asks again); a broken/expired `state` landed on `/me/rides?strava=error` with no message. Now: outcome `cancelled`; a genuine own `state` past its TTL → `expired` on the ride page (code not exchanged); forged/foreign state still → `/me/rides`, which now toasts; a return without a verified ride shows «Проверить поездку снова» + «Strava не остаётся подключённой…», the first-visit hint says access is for one check.
Contract: `StravaSyncOutcome` + `cancelled`, `expired` (additive, `docs/api.md`); a callback with neither `code` nor `error` → `error` (was `denied`).
Files: `apps/api/src/modules/strava/{oauth-state,strava.service}.ts` + tests, `packages/types/src/api/strava.ts`, `packages/ui/src/terminology.ts` + test, `apps/web/src/lib/strava/outcome-toast.ts` (hook moved from `StravaSync.tsx`), `StravaSync.tsx`, `RegistrationTicket.tsx`, `MyRidesView.tsx`, tests, `RegistrationTicket.stories.tsx` (`FinishStravaRetry`), `docs/api.md`.
Validation: api strava 49/49 on `coffee_ride_test`; web unit ride-detail+my-rides 152/152; Storybook `RegistrationTicket` 15/15; typecheck/lint/prettier clean; full `test:coverage` with live Redis/S3 + `coverage:check` holds (strava 94.79/90.52); local browser run (390 px): cancel → ride page + toast + retry copy, expired → ride page, forged → `/me/rides` + toast, no console errors.
Decisions: the retry keeps Strava's own «Connect with Strava» artwork (brand guidelines) and adds the title/hint around it; `readOAuthState` reports `expired` instead of `null` so the ride can be trusted for the redirect only.
Follow-up: positive «Проверено Strava» on production needs a real bike activity near a test ride's start.

## 2026-10-13 — CR-246 deployed

Deploy: `784755a` (PR #48, squash) on coffeeride.site via `deploy/deploy.sh` after green CI on the PR (ci, docker-smoke) and on `main`; no migrations. API `/health` db/redis/s3 ok, `GET /v1/strava/status` → `available:true`; a forged-state callback → `303 /me/rides?strava=error`; `/`, `/me/rides`, `/login` 200; the new copy (`retryTitle`) is in the served `/rides/[id]` bundle. The real cancel/expired flows on production need a signed-in QA run; positive «Проверено Strava» still needs a bike activity near a test ride's start.

## 2026-10-13 — CR-247 — Google sign-in (OIDC) next to the DB sessions; /privacy and /terms

Summary: «Войти через Google» on `/login` and `/register` (keeps `next`): server-side OIDC code flow via `openid-client` (PKCE, state, nonce, signed 10-min transaction cookie), ID token validated incl. JWKS signature, ends in the ordinary ADR-013 session. New user = verified, password-less; an existing verified email is linked atomically, an unverified one refused; races end in one user + one identity. Russian `/privacy` and `/terms`. ADR-034.
Contract: `GET /v1/auth/google`, `/google/callback`, `/google/status` (new); `types` `GOOGLE_SIGN_IN_OUTCOMES`; `ui` `GOOGLE_SIGN_IN_TERMS`, `LEGAL_TERMS`. Migration `0028`: `auth_identities`, `users.password_hash` nullable. Env `GOOGLE_CLIENT_ID`/`_SECRET` (optional). New dep `openid-client@^6.8.8`.
Files: `apps/api/src/modules/auth/{google-client,google-transaction,google.service,google.routes,session-cookie}.ts` + tests, `plugins/google.ts`, `test-support/fake-google.ts`, `env.ts`, `preflight.ts`; `packages/db` schema + `0028`; `apps/web/src/features/{auth/google,legal}`, `app/(public)/{login,register,privacy,terms}`, `sitemap.ts`, stories; env examples, `docker-compose.prod.yml`; docs.
Validation: api 762/762, web 941/941, ui 278/278, db 17, resilience 15, maps-2gis 82 (+6 opt-in); `test:coverage` + `coverage:check` hold (auth +1.78 pp lines); typecheck, lint, build green; Storybook `GoogleSignIn` + `LegalDocument` 9/9 with axe; local flow through the Next proxy to Google's consent page and every callback refusal.
Decisions: static Google metadata (no discovery); unverified existing account refused, not merged; `/privacy` text is a document in `features/legal`, not terminology.
Follow-up: a real Google client for a full sign-in; no UI to unlink Google or delete an account (by email).

## 2026-10-13 — CR-247 deployed

Deploy: `3bd2ce4` (PR #52, squash) on coffeeride.site via `deploy/deploy.sh` after green CI on the PR (ci, docker-smoke) and on `main`. Migration `0028` applied (29 rows in `__drizzle_migrations`, `auth_identities` exists, `users.password_hash` nullable). API `/health` db/redis/s3 ok; `/login`, `/register`, `/privacy`, `/terms` 200, both legal pages in `sitemap.xml`. Google switched on the same day at the owner's request: `GOOGLE_CLIENT_ID`/`SECRET` copied from the local OAuth client (project `coffee-511414`) into the VPS `.env` (backup `.env.bak-*` kept), `api` recreated. `GET /v1/auth/google/status` → `available:true`, the button is in `/login`'s HTML, the click lands on Google's sign-in page for «coffeeride.site» (redirect URI accepted, no `redirect_uri_mismatch`). Next: a real sign-in by a person.

## 2026-10-13 — CR-249 — Google sign-in claims an unverified account (ADR-035)

Summary: production: the owner's Google sign-in answered «Аккаунт с этим email уже есть, но почта в нём не подтверждена…» — their password account had never been confirmed, and ADR-034 refused to link it (pre-hijacking). Owner's decision (ADR-035): when Google vouches for the address, the unverified account is claimed in the linking transaction — email marked verified (verify links consumed), `password_hash` cleared, pending reset links consumed, every session deleted — then linked and signed in. A blocked account is still refused. `account_unverified` is no longer produced (kept in `GOOGLE_SIGN_IN_OUTCOMES` for old links).
Files: `apps/api/src/modules/auth/google.service.ts` (`claimUnverifiedAccount`), `google.routes.ts`, `google.routes.test.ts` (claim voids the squatter's password/session/links; blocked+unverified refused; the registration race now claims), `docs/decisions.md` (ADR-035), `docs/auth.md`, `docs/api.md`, `.claude/rules/security.md`, `.claude/rules/do-not-break.md`.
Validation: api auth 107/107 (+3 live-Redis skipped) on `coffee_ride_test`; see the PR for coverage/lint/typecheck.

## 2026-10-13 — CR-249 deployed

Deploy: `2304863` (PR #54, squash) on coffeeride.site via `deploy/deploy.sh` after green CI on the PR (ci, docker-smoke) and on `main`. No migration. Before it, the API log showed every production Google sign-in since CR-247 refused with `reason: account_unverified` (the owner's unconfirmed password account). After: API `/health` db/redis/s3 ok, `GET /v1/auth/google/status` → `available:true`, the button is in `/login`'s HTML. Pending: the owner's real sign-in (claims the account; its password is cleared — «Забыли пароль?» sets a new one).

## 2026-10-13 — CR-250 — Account rate-limit key no longer carries the email

Summary: security finding (LOW): the per-account auth rate limit (CR-058) keyed Redis as `auth-rl:account:<route>:<email>`, and the fail-open warning logged `{ err, key }` — a Redis outage wrote register/login/forgot-password emails into the API log (and ioredis errors carry the key in `command.args`). The key is now `auth-rl:account:<route>:<HMAC-SHA256>` over the trimmed, lowercased identifier, keyed from `AUTH_SECRET` under its own label; the warning no longer logs the key. Case/space variants of one email now share one counter.
Contract: none (the 429 `account_rate_limited` unchanged).
Files: `apps/api/src/lib/account-rate-limit.ts` (`accountRateLimitKeyFactory`), its test, `apps/api/src/modules/auth/auth.routes.ts`.
Validation: api 767/767, 0 skipped (live Redis/S3, `coffee_ride_test`); `pnpm coverage:check` holds; api typecheck, lint (0 errors), prettier.
Decisions: HMAC, not a bare hash — a leaked key can't be checked against a guessed email. Old raw-email keys expire within their 60 s window after deploy.
Follow-up: none.

## 2026-10-13 — CR-250 deployed

Deploy: `65b5c4f` (PR #56, squash) on coffeeride.site via `deploy/deploy.sh` after green CI on the PR (ci, docker-smoke) and on `main`. No migration. After: API `/health` db/redis/s3 ok, site `200`, `POST /v1/auth/login` with an empty body → `400`, no error-level API log lines in the first 2 minutes. Pre-existing raw-email account keys expire within their 60 s window; log lines written before the fix stay as they are.

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
