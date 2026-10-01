# Current task

## CR-164 — KI-060 start-place fallback; four stale KI entries archived

Status: **done, validated, committed** (2026-10-01). Details: `docs/changelog.md`.

Goal (handoff items 1–2): verify/archive the stale KI entries, then fix KI-060.
Item 3 (KI-057) was **not started** — it needs a dark MapGL style id from the
owner's 2GIS account and the request left that placeholder unfilled. Item 4
(coverage baseline) was not started either — it must run in the CI environment.

- [x] KI-001 — verified: CR-074's Dockerfiles + `.dockerignore`, CR-075's
      `docker-compose.prod.yml` + `deploy/Caddyfile`, CR-134's
      `deploy/smoke/docker-compose.smoke.yml` (which also closes the KI-019
      "never actually built" caveat). Archived.
- [x] KI-009 — verified: CR-083/084/085/086 all in the changelog. Archived.
- [x] KI-010 — verified: the `*2gis*` `no-restricted-imports` rule is present in
      `apps/web`, `apps/api`, `packages/ui`, `packages/db`, `packages/config`;
      `packages/maps-2gis` is the single opt-out. Archived.
- [x] KI-020 — verified: `apps/web/src/components/ui/` does not exist and every
      primitive (incl. `Dialog`/`DatePicker`) is exported from `packages/ui`.
      `components.json` left as-is deliberately — unused by any script/CI step.
      Archived.
- [x] KI-021 — **kept open** with a dated verification note: no `ride-service.ts`
      schema and no `ride_service` pgEnum exist, and the snake_case service keys
      appear nowhere outside `terminology.ts`. The registration half is a
      non-issue (`registration_status` = `active`/`cancelled`, a different axis
      from `REGISTRATION_ACTION_TERMS`' CTA labels).
- [x] KI-060 — fixed: additive `startDescription` on `PublicRideListItem`
      (`packages/types`, `ride-response.schema.ts`, `rides.service.ts`'s
      `getRideListExtras` — same `selectDistinctOn`, no extra query);
      `RideLegendRow` and `FeaturedRideCard` both go through `formatStartPlace`
      now. `FeaturedRideCard` had been rendering `ride.startLabel` raw, so it
      printed the literal «Старт: Старт» — that is the real bug behind the
      entry. Archived.

Validation: `pnpm typecheck` green (8/8), `pnpm lint` green (9/9), `apps/web`
unit 499 passed (53 files), `apps/api` `src/modules/rides` 217 passed + 3
skipped. API tests need `TEST_DATABASE_URL` passed explicitly on this machine
(`postgresql://postgres:postgres@127.0.0.1:5432/coffee_ride` — `.env` is not
exported into the shell).

Not run: `pnpm build` (no build-affecting change — types/service/two components
only, all covered by typecheck) and the Playwright visual suite (no layout
change; the start line's _text_ can change on a seeded ride, but the e2e
fixtures don't label a start point «Старт»).

## NEXT SESSION — handoff (written 2026-10-01, after CR-164)

`docs/tasks.md` has no open items. What's left:

1. **`coverage-baseline.json` refresh** — `pnpm test:coverage && pnpm
coverage:baseline` in the CI environment (Postgres/Redis/S3 up,
   `RUN_LIVE_S3_TESTS=1`, `RUN_LIVE_REDIS_TESTS=1` + `REDIS_URL`, and **no**
   `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` in the shell — KI-070). `packages/ui` is at
   100 % lines, so the floor can rise. CR-164 also added tests, so its numbers
   should be folded in.
2. **KI-057 — still blocked on the owner**: a dark MapGL style id from their 2GIS
   account, then an additive `theme` option on `MapRenderOptions` mapped inside
   `packages/maps-2gis`. Nothing to do until that id exists.
3. **CR-148 full run** — `pnpm seed:demo` with routes, once 2GIS REST is
   reachable from this machine (KI-056).

Owner-side, not code: `EMAIL_FROM_ADDRESS` + Unisender DNS (KI-026/042/055);
commercial 2GIS key (KI-075); 2GIS reachability via VPN (KI-056); Caddy/TLS on a
real host (KI-045). KI-038 is a documented build gotcha, no fix needed.
Still watch: `route-points-stops.spec.ts` passed only on retry in CI twice.

## CR-161…CR-163 — CI unblock, KI-078/079/066/065, nightly load test

Status: **done, committed** (2026-10-01). Details: `docs/changelog.md`.

- [x] CR-161: coverage gate green with real tests (ui 202, web +5); KI-078
      toggle hidden while the map is degraded + `home.spec.ts` regression.
- [x] KI-079: CI run `36856168437` — only `ride-detail` chromium differed
      (CR-155 layout); its actual committed as baseline.
- [x] Fixed my own slip: moving KI-079 truncated the KI archive in `047e8fa`
      (opened for write before read); restored verbatim in `855fd7e`.
- [x] CR-162: KI-066 aggregate endpoint + widget; KI-065 visibility endpoint +
      form (owner: hide anytime, re-show only with no registrations).
- [x] CR-163: `api-latency.js` think time (nightly load test red since CR-139).
- Owner-side, not code: `EMAIL_FROM_ADDRESS` + Unisender DNS (KI-026/042/055);
  commercial 2GIS key (KI-075).

## CR-160 — Fix 2GIS multi-stop routing bug (found finishing CR-148)

Status: **done, committed** (2026-09-29). Details: `docs/changelog.md` CR-160.

- [x] Found: 2GIS became reachable from this machine; ran `pnpm seed:demo`
      without `--no-routes` for the first time — first ride (a closed loop)
      failed `422 route_not_buildable`.
- [x] Root cause confirmed live against the real Routing API: every point was
      sent as `type: 'stop'`; 2GIS only honors `stop` at the first/last
      position, silently drops one in the middle.
- [x] Fix: `packages/maps-2gis/src/route.ts` sends `type: 'pref'` for
      intermediate points, `type: 'stop'` for first/last only.
- [x] Regression test added (`provider.test.ts`).
- [x] Live-verified: 7-point loop 51 m → 22 417 m (all waypoints honored).
- [x] `pnpm seed:demo` (no `--no-routes`) now green end to end — completes
      **CR-148**.
- [x] `packages/maps-2gis` typecheck/lint/test 48/48; live contract suite
      5/5; `apps/api` typecheck/lint/test 495/495.
- [x] `docs/tasks.md` (CR-148 checked off, CR-160 added), `docs/changelog.md`,
      `.claude/context/known-issues.md` (KI-056 updated), `project-state.md`
      updated.
- [x] Committed/pushed.

## CR-159 — Fix KI-080: light-theme `--danger` contrast

Status: **done, committed** (2026-09-29). Details: `docs/changelog.md` CR-159.

- [x] Light `--danger` `#D42B20` → `#B92A1E` (`packages/ui/src/tokens.css`),
      AA against `--bg` and `ErrorState`'s tint, not just white.
- [x] `docs/design.md` §3 swatch table/prose updated.
- [x] Storybook's `KI_080_DANGER_CONTRAST` axe exception removed (file
      deleted, 4 story files no longer import it).
- [x] ui/web typecheck+lint+test green; `test:storybook` 59/59, zero axe
      rules disabled; visually checked via `storybook-mcp`.
- [x] KI-080 archived as resolved.

## CR-158 — Storybook for UI primitives and ride components

Status: **done, committed** (2026-09-29). Details: `docs/changelog.md` CR-158.

Request (owner): Storybook via `create storybook --features docs test a11y` +
`@storybook/addon-mcp`, `componentsManifest` on; stories for Button, Input, Badge,
RideCard, RideStatus, RideFilters with light/dark themes and loading/error/empty/
disabled; a11y + interaction tests; no product UI change; run it and connect it to
Claude Code (`storybook-mcp`, project scope).

- [x] Storybook in `apps/web` (nextjs-vite); addons vitest/a11y/docs/mcp.
- [x] Six story files, every state + dark + both-themes; `play` tests.
- [x] `test:storybook` 59/59 (axe WCAG 2.1 AA as errors); unit 490/490.
- [x] Dev server on :6006, `/mcp` answers; `.mcp.json` has `storybook-mcp`.
- Found: KI-080 (light `--danger` contrast) — scoped exception in 7 stories.

## CR-157 — Larger, easier date picker on the create-ride page

Status: **done, not committed** (2026-09-29). Validation: see `docs/changelog.md`
CR-157. Previous task CR-156 (wizard) is done and committed (`765771f`).

Request (owner, screenshot of Safari's native date popup): «сделай календарь
удобнее и больше на странице создания заезда».

### Acceptance

- [x] Larger day targets (48px), readable numbers, Russian month/weekday names.
- [x] Faster picking: «Сегодня / Завтра / Сб / Вс» quick picks; past days disabled.
- [x] Phone: bottom sheet, no horizontal scroll; keyboard + screen-reader support.
- [x] Value contract unchanged (`YYYY-MM-DD`), create flow + e2e green.
