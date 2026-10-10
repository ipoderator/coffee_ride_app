# Project State

A **snapshot** of where the project is now — overwritten, never appended to. Hard cap
~150 lines / ~12 KB (CR-202/203): history goes to `docs/changelog.md`, invariants to
`.claude/rules/do-not-break.md`; the long pre-CR-203 version is
`.claude/context/project-state-archive.md` (grep only, never read whole).

## Phase

MVP feature-complete and in owner QA; not deployed anywhere yet (KI-045). Every backlog
section is done (`docs/tasks.md`, archive in `docs/tasks-archive.md`):

- auth — email + password, DB sessions, verify/resend/reset email;
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

CR-228..CR-232 — admin panel P0 (ADR-032), validated and merged into `main`
(2026-10-10, together with the Dependabot triage updates). Admin = `platform_admins`
row from the host CLI; `/v1/admin/*` behind `requireAdmin`; `/admin` section in
apps/web (Обзор, Пользователи, Заезды, Отзывы, Журнал); block/hide/cancel enforced
across auth, rides, registrations, reviews; the organizer sees why a ride is hidden
(`GET /v1/rides/:id` → owner-only `moderation`).

Before this: CR-227 — production email live on Unisender Go, verification required
again; CR-219 — **coffeeride.site is live** (`docs/deployment.md` → "Production host").

## Implemented (by area — details in the changelog and `architecture-map.md`)

- **Stack/infra:** pnpm + Turborepo, Node 24 LTS; Next.js 15 / React 19 / Tailwind v4;
  Fastify 5 + Zod + OpenAPI; Drizzle + Postgres (migrations `0000`–`0026`); Redis
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

CR-232 items 1–7 (`admin:grant` requires a confirmed email; reason dialogs name
their record and say who reads the reason; mobile section tabs reveal the active
tab; list filters in the URL; overview links/refresh and log filters; item 7 — full
validation sweep + review fixes) done on the same branch. Open review findings
(not fixed, item 7): see "Next" 0.
CR-228..CR-231 — awaiting the owner's review and an explicit request to commit; then
merge/deploy is the owner's call. On deploy: run migration `0026`, then
`admin:grant <owner email>` via the `migrate` image (`docs/deployment.md` → "Admin access").

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
1. **KI-089** — owner decision: carry `next` into the emailed verification link
   (optional `next` on `POST /v1/auth/register`) or keep CR-197 web-only. CR-190
   follow-ups: no e2e journey for the reschedule, no email (in-app only).
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
6. **KI-086** — owner decision: which sidebar item lights on a ride's
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
patched release (dev-only lint path); KI-086/089 await owner
decisions; KI-021/026/038/042 long-standing narrow items.

## Do not break

`.claude/rules/do-not-break.md` — a path-scoped rule, loads whole with any code/infra
file (CR-204).

## Last updated

2026-10-10 (CR-232 item 7)
