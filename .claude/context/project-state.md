# Project State

A **snapshot** of where the project is now — overwritten, never appended to. Hard cap
~150 lines / ~12 KB (CR-202/203): history goes to `docs/changelog.md`, invariants to
`.claude/rules/do-not-break.md`; the long pre-CR-203 version is
`.claude/context/project-state-archive.md` (grep only, never read whole).

## Phase

MVP feature-complete and in owner QA; not deployed anywhere yet (KI-045). Every backlog
section is done (`docs/tasks.md`, archive in `docs/tasks-archive.md`):

- auth — email + password (reCAPTCHA v2, ADR-038), Google + Yandex ID sign-in
  (ADR-034/037), DB sessions, verify/resend/reset email;
- organizer profile, full ride lifecycle (`draft → published → registration_open →
registration_closed → started → finished`, `cancelled`), the six-tab ride workspace
  «Управление заездом», reschedule (ADR-029);
- GPX upload + route builder, stops, route points, pace groups (ADR-022), cover images,
  requirements, organizer contacts;
- registration + waitlist with FIFO promotion, rider list/profiles + garage (ADR-023),
  finish check-in and ride closing (ADR-027/028), reviews + organizer rating;
- in-app notifications via a Redis queue, ride updates fan-out, organizer journal;
- discovery (map + list, filters, archive section), cabinets for both sides,
  «Ночной старт» visual direction (ADR-024) with the ADR-026 type scale.

## Current task

CR-264 (owner, 2026-10-14) — `/login` to the auth mockup (tab «Вход»), validated on
`experiments`, committed on `experiments` (no PR yet): same frame as `/register`
(`LoginScreen`), Google then Yandex ID («Войти с Яндекс ID»), «или через email»,
«Забыли пароль?» on the password line (`ui` `FormField.labelAction`), show/hide. No auth
logic change; Yandex/social-only password login/forged code/prod cookie flags pinned
by new API tests.

Before it: CR-262 (owner, 2026-10-14) — `/register` to the auth mockup
(`reference/coffee-ride-auth-mockup`, tab «Регистрация»), validated on `experiments`,
committed on `experiments` (no PR yet):

- story column (`lg`+, text only since CR-263), Google/Yandex ID first («Продолжить с …»), strength meter, live
  match line, show/hide (`ui` `PasswordInput`);
- ADR-039: `confirmPassword` checked by the API too; `/register` answers a taken email
  like a new one (`201 { emailVerificationRequired, verificationUrl? }`, no `user`) and
  emails the owner «Аккаунт уже есть».

Before it: CR-260 + CR-261 — Yandex ID sign-in (ADR-037) and reCAPTCHA v2 on password
auth (ADR-038), one PR from `feat/yandex-oauth-recaptcha` (committed).

Before it (details in the changelog): CR-259 page CSP by nonce (ADR-036) and CR-251,
CR-253..CR-258 Lictor fixes (deployed, PR #61); CR-249/CR-247 Google sign-in (ADR-034/035,
deployed); CR-246 Strava sync copy; CR-235..CR-245 production QA; CR-234 Strava sync;
CR-228..CR-233 admin panel; CR-219 — **coffeeride.site is live** (`docs/deployment.md`).

## Implemented (by area — details in the changelog and `architecture-map.md`)

- **Stack/infra:** pnpm + Turborepo, Node 24 LTS; Next.js 15 / React 19 / Tailwind v4;
  Fastify 5 + Zod + OpenAPI; Drizzle + Postgres (migrations `0000`–`0027`); Redis
  (BullMQ notifications, rate limits); S3 — SeaweedFS locally/CI (ADR-025); 2GIS via
  `maps-core`/`maps-2gis` (ADR-010/020). Production: Docker images for web/api/migrate,
  `docker-compose.prod.yml` + Caddy (ADR-018), smoke-tested in CI (`docker-smoke`)
  except Caddy/backup (KI-045).
- **Quality gates:** CI `ci` job — format, lint, typecheck, Vitest with a coverage
  floor (`coverage-baseline.json`, CR-136), build, Playwright e2e incl. visual
  baselines (CR-138); Storybook + axe (CR-158); k6 load suite (manual/nightly,
  CR-139); weekly 2GIS contract test.
- **Harness:** 17 project skills (`.claude/skills/`) chosen via `.claude/CLAUDE.md` →
  "Skill routing"; targeted-read protocol and "Token economy" there; 8 of 10
  `.claude/rules/` path-scoped; Stop/PreCompact hook reminds about context files.

## In progress

CR-264 — committed on `experiments` (no PR yet); no env var or migration. CR-262/263 —
committed on `experiments` (no PR yet); ship after (or with)
CR-260/CR-261. Next from the same mockup: the maintenance screen (owner's prompt 3).

CR-260/CR-261 — awaiting merge and deploy. Owner-side: `YANDEX_CLIENT_ID`/`_SECRET`
(redirect URI `…/api/v1/auth/yandex/callback`), `RECAPTCHA_SECRET_KEY` and
`NEXT_PUBLIC_RECAPTCHA_SITE_KEY` (v2 «I'm not a robot», coffeeride.site + localhost) in
the VPS `.env`, then a web rebuild; the reCAPTCHA secret is not yet confirmed by a real
solved challenge (a registration → 201, `captcha_unavailable` = secret rejected); name
reCAPTCHA in the privacy policy.

CR-249 — first production Google sign-in hit `account_unverified` (the owner's own
password account was never confirmed). Owner chose ADR-035: Google claims an unverified
account (verified, password/sessions/pending links voided). Deployed 2026-10-13
(`2304863`, PR #54). Next: the owner's real Google sign-in confirms the claim path.

CR-247 — deployed 2026-10-13 (`3bd2ce4`, PR #52, migration `0028` applied); Google on
in production (OAuth client `coffee-511414`, keys in the VPS `.env`, Google accepts the
redirect URI). Next: a real sign-in by a person; the consent screen's publishing status
(Testing limits sign-in to listed test users). Legal text needs the owner's review.

CR-246 — deployed 2026-10-13 (`784755a`, PR #48); QA to re-run cancel/retry on
production. The positive
«Проверено Strava» path still needs a real Strava bike activity started near a test
ride's start (QA account has none).

CR-245 — deployed 2026-10-12 (`b19a89a`); production check of the emailed link waits for
the next real registration from a page with `next`. CR-244 — QA to retry the reset with the exact registered address;
owner call on mailing an unknown address «нет аккаунта».

CR-235..CR-243 — deployed 2026-10-12 (`ef49fcd`). CR-236's profile-link item needs the QA's
steps/device; a «reopen registration» transition (CR-237) would be a lifecycle change
— owner call. `EditRideForm` still keeps field errors until the next save (owner call).

CR-234 — deployed and switched on 2026-10-12 (`STRAVA_CLIENT_ID`/`SECRET` in the VPS
`.env`, `GET /v1/strava/status` → `available:true`). Owner-side: the Strava app's
Authorization Callback Domain must be `coffeeride.site` (localhost stays allowed by
Strava), and Strava must review the app (a new app connects 1 athlete only).

CR-228..CR-232 — deployed (see "Current task"); open review findings: "Next" 0.
Storybook: `AdminOverview` (3 stories) and `CabinetSectionTabs` «Admin Last Tab»
(2) fail axe `label-content-name-mismatch` — the overview counters' `aria-label`
doesn't contain their visible text; found 2026-10-11, pre-existing on `main`.

CR-221..CR-226 — validated locally (see changelog), awaiting the owner's review/commit
on `experiments`; deploying needs `SITE_URL` built in (prod compose derives it from
`DOMAIN`) and a production smoke check. Visual baselines not re-run (Docker amd64).

CR-220 — the one-off `UPDATE users SET email_verified = true` for accounts made before
the switch is left to the owner.

CR-208 — 13 Dependabot PRs classified, 8 safe ones rebased, none merged yet;
#26 (seaweedfs) still needs `pnpm smoke:docker` before merging. CR-212 supersedes
Dependabot PR #22 — close it rather than merging.

## Next

Deferred by the owner (2026-10-02): map bbox fetch + marker clustering (until ride
volume grows; the API already supports bbox, the web client doesn't send it); a public
organizer page / `GET /v1/organizers/:id/reviews` (declined — the header rating can
differ from a ride's own review list); splitting `rides.service.ts`/
`registrations.service.ts` (not now).

0. **Admin follow-ups from CR-232 item 7's review** (owner call before fixing):
   an admin's «Завершить все сессии» on their own card ends their own session and
   the next click shows a generic error (`AdminUserCard.tsx`); the users list shows
   «Без имени» where the card shows first + last name (list items carry no names —
   additive API field); hide/unhide keeps the row in a list filtered to the old state
   (deliberate: in-place undo); `CANCELLABLE` in `AdminRidesList.tsx` mirrors the API's
   set by hand; `server-admin.ts` duplicates `server-ride.ts`'s forwarded headers;
   `/admin/users/<bad id>` renders the not-found page with HTTP 200 (admin-only,
   noindex; non-admins still get 404 — KI-098).
1. **CR-190 follow-ups**: no e2e journey for the reschedule, no email (in-app only).
2. **KI-057** (2GIS dark basemap) — blocked on the owner supplying a dark MapGL style
   id from their 2GIS account; then an additive `theme` option on `MapRenderOptions`
   mapped inside `packages/maps-2gis`.
3. **CR-148 full run** — `pnpm seed:demo` with routes, once 2GIS REST is reachable
   from this machine (KI-056); the seed could also fill requirements.
4. **Before launch, owner-side** (CR-210 prepared the repository for each; none is
   code work): a commercial 2GIS key (KI-075); off-host backups (KI-045). Email is
   done (CR-227 — verification required again, reset verified live).
5. **KI-075's error mapping** — a separate CR the owner kept out of CR-210's scope:
   2GIS's 403 (demo-key distance, and a commercial key's own quota/licence refusals)
   maps to `unavailable` → 503 "route builder unavailable", so the user reads «сервис
   недоступен» instead of «точки слишком далеко друг от друга». A commercial key
   changes the limit, not the mapping.
6. **Re-run `lictor-security-check`** on the deployed code (expect no open finding).
   Owner-side: restrict the 2GIS MapGL key to the domain.
7. **KI-086** — owner decision: which sidebar item lights on a ride's
   participants/updates tab (CR-150's `activeOn` vs «Заезды» everywhere).

## Important decisions

All in `docs/decisions.md` (ADR-001..ADR-031, grep by number). Most load-bearing:
ADR-006/013 (auth, DB sessions, single origin, no CORS), ADR-008 (modular monolith),
ADR-009 (cabinet feature modules), ADR-010/020 (maps adapter + render layer), ADR-011
(`/v1`, cursor pagination, RFC 9457), ADR-012 (`timestamptz` + ride timezone), ADR-016
(`packages/resilience`), ADR-024/026 (visual direction, type scale), ADR-031
(data services on the app host, `docker-compose.infra.yml`).

## Known limitations

Open KIs (details: `.claude/context/known-issues.md`): KI-045 Caddy/ACME never run on a
real host; KI-055/056 Unisender and 2GIS REST unreachable from this machine;
KI-075 2GIS demo key (≤ 50 km routing); KI-057 light basemap in the dark theme; KI-082
undocumented tile-probe host (accepted, guarded weekly); KI-095 `braces` has no
patched release (dev-only lint path); KI-086 awaits an owner
decision; KI-021/026/038/042 long-standing narrow items.

## Do not break

`.claude/rules/do-not-break.md` — a path-scoped rule, loads whole with any code/infra
file (CR-204).

## Last updated

2026-10-14 (CR-264)
