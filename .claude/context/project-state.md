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

CR-208 (Dependabot triage) — paused; `main` is now green, so it can resume. Latest
work (details in `docs/changelog.md`):

- CR-212 — Next 16.3.8 (Dependabot #22, the last red check): `apps/web` stays on
  webpack via an explicit `--webpack`, because Turbopack has no `extensionAlias`
  for `packages/types`' NodeNext `.js` imports (vercel/next.js#82945);
  eslint-config-next 16's prebuilt flat configs are imported directly, retiring
  the FlatCompat bridge. New `set-state-in-effect` rule parked at `warn` (KI-092).
  E2E needed a route warm-up (`e2e/warmup.setup.ts`): Next 16's dev server reloads a
  page when it compiles a route under it, which broke CI's cold runs.
- CR-211 — `/verify-email` sent its single-use token twice: the request lived in a
  `useEffect`, and e2e serves the web app with `pnpm dev`, so React Strict Mode's
  double-invoke burned the link and rendered «Ссылка недействительна» over a
  verification that had succeeded. The in-flight promise is now cached per token.
  The API was correct throughout; this closes CR-209's open `login-return.spec.ts`
  follow-up.
- CR-210 — pre-launch configuration readiness: a warning tier below `loadEnv()`'s
  boot refusal (`apps/api/src/preflight.ts`, `pnpm preflight`) for configuration
  that boots but leaves a feature dead — above all an email key with no verified
  sender; `deploy/FIRST-DEPLOY.md`; ADR-030 on error tracking.
- CR-209 — the auth coverage gate reddened `ci` on commits that changed no code:
  CR-205's token races covered the in-transaction guard only by chance. Two
  deterministic tests added; baseline untouched.
- CR-207 — `ToastProvider` clears its pending timers on unmount; an uncleared one
  fired after jsdom teardown and failed `ci` with every test passing (predates CR-206).
- CR-206 — the `ponytail` plugin installed globally (user-level, not in this repo); its
  repo audit applied where risk-free: three unused `apps/web` deps dropped,
  `formatPriceParts` inlined.
- CR-205 — security audit fixes: GPX download header, web page security headers,
  single-use token race, dependency bumps, Dependabot alerts on (KI-090 opened).
- CR-204 — `do-not-break.md` became a path-scoped rule (loads whole); area history
  via changelog grep in the read protocol.
- CR-203 — this file cut to a snapshot; `do-not-break.md` split out.
- CR-202 — token economy: targeted reads, compact context files, path-scoped rules.
- CR-201 — eight more project skills + skill routing in `.claude/CLAUDE.md`.
- CR-200 — every destructive delete asks in `ConfirmDialog` (KI-087, KI-088 closed).
- CR-199 — notification times in the ride's timezone.
- CR-196..CR-198 — QA `fe0b4c2`; CR-189..CR-195 — QA `13653ed`.

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

CR-208 — 13 Dependabot PRs classified, 8 safe ones rebased, none merged yet. No
longer blocked on `main`: both runs at `fd1819b` (CR-209) concluded `success`, so the
coverage gate holds. The npm bumps (#8/#9/#23) depended on `ip-address@10.7.3`
leaving Dependabot's 3-day quarantine on 2026-10-05 ~10:35Z — check it has.
#26 (seaweedfs) still needs `pnpm smoke:docker` before merging.

CR-210..CR-212 are committed; `main` was green end to end at `5a75455`
(run `37317030807`). CR-212 supersedes Dependabot PR #22 — close it rather than
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
   then the first real deployment against `deploy/FIRST-DEPLOY.md` (KI-045).
5. **KI-075's error mapping** — a separate CR the owner kept out of CR-210's scope:
   2GIS's 403 (demo-key distance, and a commercial key's own quota/licence refusals)
   maps to `unavailable` → 503 "route builder unavailable", so the user reads «сервис
   недоступен» instead of «точки слишком далеко друг от друга». A commercial key
   changes the limit, not the mapping.
6. **KI-086** — owner decision: which sidebar item lights on a ride's
   participants/updates tab (CR-150's `activeOn` vs «Заезды» everywhere).
7. **KI-090** — the Next 16 upgrade (Dependabot #22) as its own task; clears the last
   `pnpm audit` advisories (Next 15's pinned postcss).

## Important decisions

All in `docs/decisions.md` (ADR-001..ADR-030, grep by number). Most load-bearing:
ADR-006/013 (auth, DB sessions, single origin, no CORS), ADR-008 (modular monolith),
ADR-009 (cabinet feature modules), ADR-010/020 (maps adapter + render layer), ADR-011
(`/v1`, cursor pagination, RFC 9457), ADR-012 (`timestamptz` + ride timezone), ADR-016
(`packages/resilience`), ADR-024/026 (visual direction, type scale).

## Known limitations

Open KIs (details: `.claude/context/known-issues.md`): KI-045 production manifest never
run end to end; KI-055/056 Unisender and 2GIS REST unreachable from this machine;
KI-075 2GIS demo key (≤ 50 km routing); KI-057 light basemap in the dark theme; KI-082
undocumented tile-probe host (accepted, guarded weekly); KI-090 postcss pinned by
Next 15 (build-time only); KI-086/089 await owner
decisions; KI-021/026/038/042 long-standing narrow items.

## Do not break

`.claude/rules/do-not-break.md` — a path-scoped rule, loads whole with any code/infra
file (CR-204).

## Last updated

2026-10-05 (CR-210)
