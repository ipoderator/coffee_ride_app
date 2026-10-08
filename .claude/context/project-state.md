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

CR-219 — **coffeeride.site is live** (2026-10-08): first production deploy on the VPS
(`/opt/deployments/coffee-ride`, `docs/deployment.md` → "Production host"), Caddy/ACME
proven, `www.` → 301. Email is off until a verified Unisender sender is set
(`EMAIL_FROM_ADDRESS` empty in the server `.env`). Latest work (details in
`docs/changelog.md`):

- CR-219 — deploy per `deploy/FIRST-DEPLOY.md`: §1–4 and §6 passed; §5 (email) and
  the off-host backup copy remain (KI-045).

- CR-218 — one VPS for app + Postgres + Redis + S3 (ADR-031):
  `docker-compose.infra.yml` overlay, `deploy/deploy.sh`,
  `deploy/production.env.example`; prod compose now passes the email env to `api`
  (was missing — email dead in prod). Docker smoke on the overlay green locally,
  incl. backup → restore.
- CR-217 — token jobs `removeOnFail`, unawaited reset email with no queue,
  `__Host-session`, 50 MP image cap, `?v=` key-hash cover/avatar URLs (KI-094),
  stored route geometry capped at 5,000 points (KI-093 closed).
- CR-214..216 — Shield scan fixes: `sharp` 0.35.5 (librsvg CVE) plus a JPEG/PNG/WebP
  signature gate so no other libvips parser sees an upload; `source-map-js` 1.2.2
  (KI-090 closed); esbuild-kit's esbuild lifted to ^0.25.4; `lint-staged` 17. Supply
  chain: actions pinned by SHA, pnpm `blockExoticSubdeps` and
  `trustPolicy: no-downgrade`, Dependabot `cooldown` 7 d except npm. No pnpm
  `minimumReleaseAge` and no npm `cooldown` (Dependabot maps cooldown to that pnpm
  flag, which re-checks the whole lockfile and failed every npm job). `braces` has
  no fix (KI-095).
- CR-212 — Next 16.3.8 (Dependabot #22, the last red check): `apps/web` stays on
  webpack via an explicit `--webpack`, because Turbopack has no `extensionAlias`
  for `packages/types`' NodeNext `.js` imports (vercel/next.js#82945);
  eslint-config-next 16's prebuilt flat configs are imported directly, retiring
  the FlatCompat bridge. New `set-state-in-effect` rule parked at `warn` (KI-092).
  E2E needed a route warm-up (`e2e/warmup.setup.ts`): Next 16's dev server reloads a
  page when it compiles a route under it, which broke CI's cold runs.

## Implemented (by area — details in the changelog and `architecture-map.md`)

- **Stack/infra:** pnpm + Turborepo, Node 24 LTS; Next.js 15 / React 19 / Tailwind v4;
  Fastify 5 + Zod + OpenAPI; Drizzle + Postgres (migrations `0000`–`0025`); Redis
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

CR-217/CR-218/CR-219 — committed and pushed; CI green at `1f741cf` (incl. the first
`docker-smoke` on the infra overlay).

CR-208 — 13 Dependabot PRs classified, 8 safe ones rebased, none merged yet. No
longer blocked on `main`: both runs at `fd1819b` (CR-209) concluded `success`, so the
coverage gate holds. The npm bumps (#8/#9/#23) depended on `ip-address@10.7.3`
leaving Dependabot's 3-day quarantine on 2026-10-05 ~10:35Z — check it has.
#26 (seaweedfs) still needs `pnpm smoke:docker` before merging.

CR-210..CR-212 are committed; `main` is green end to end at `941c555`
(run `37425849763`, e2e 60/60, no flaky). CR-212 supersedes Dependabot PR #22 — close it rather than
merging, its `package.json` change is a subset that breaks ESLint on its own.

## Next

Deferred by the owner (2026-10-02): map bbox fetch + marker clustering (until ride
volume grows; the API already supports bbox, the web client doesn't send it); a public
organizer page / `GET /v1/organizers/:id/reviews` (declined — the header rating can
differ from a ride's own review list); splitting `rides.service.ts`/
`registrations.service.ts` (not now).

1. **KI-089** — owner decision: carry `next` into the emailed verification link
   (optional `next` on `POST /v1/auth/register`) or keep CR-197 web-only. CR-190
   follow-ups: no e2e journey for the reschedule, no email (in-app only).
2. **KI-057** (2GIS dark basemap) — blocked on the owner supplying a dark MapGL style
   id from their 2GIS account; then an additive `theme` option on `MapRenderOptions`
   mapped inside `packages/maps-2gis`.
3. **CR-148 full run** — `pnpm seed:demo` with routes, once 2GIS REST is reachable
   from this machine (KI-056); the seed could also fill requirements.
4. **Before launch, owner-side** (CR-210 prepared the repository for each; none is
   code work): a commercial 2GIS key (KI-075); a verified Unisender Go sender in
   `EMAIL_FROM_ADDRESS`, without which password reset and email verification are dead
   ends for real users (KI-026/KI-042/KI-055) — `pnpm preflight` now warns on both;
   the site is deployed (CR-219) — after setting the sender, edit the server `.env`,
   re-run `deploy/deploy.sh` and finish FIRST-DEPLOY §5; set up off-host backups (KI-045).
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

2026-10-08 (CR-219)
