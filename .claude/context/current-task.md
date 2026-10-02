# Current task — CR-185: UX handoff (P1/P2) on top of CR-184 — HANDOFF

> Session handoff 2026-10-02, completed the same day. CR-184 + CR-185 are committed
> together in one commit; the only open follow-up is KI-084 (screenshot baselines).

## Source

Owner's UX handoff + mockup (outside the repo):
`~/Documents/ChatGPT/КофеРайд/coffee-ride-ux-review/CLAUDE_CODE_HANDOFF.md`, `index.html`
(base `5404297`). Task: every P1/P2 row, ADR-009 feature modules, API and ride lifecycle
unchanged, current tokens, no mockup numbers/tracks in production.

## Done (CR-185)

P1 live/overdue/management were CR-184; CR-185 added the handoff's behaviour rules:

1. **Dashboard order** — active work above KPIs. `features/organizer/overview` split into
   `OrganizerOverviewWidget` (head: greeting + «Отправить обновление», owns no-profile/error)
   and new `OrganizerKpiWidget` (order 25, after live-rides 20); one shared load via
   `overview/hooks/useOverviewData.ts` (tiny `useSyncExternalStore` store, retry from the
   head reloads both, reset when last subscriber unmounts). `LiveRidesWidget` sections now
   live → «Требует решения» → upcoming.
2. **Finish with unresolved riders** — `EditRideForm` opens `ConfirmDialog` naming the count
   (`FINISH_CHECKIN_TERMS.finishConfirm*`); no dialog when unresolved = 0. API allows
   attendance in `started` and `finished`, so the dialog text "статусы можно отметить и
   после завершения" is true.
3. **Participants context (P1)** — new `components/cabinet/RideContextHeader.tsx` (title,
   start, status, «Требует решения» via `isRideOverdue`, «Управление заездом →»), on
   `/organizer/rides/[id]/participants` and `/updates` (the two `NearestRideRedirect`
   targets). New `fetchOwnRide` in `lib/organizer/own-rides.ts`. `RIDE_UPDATES_TERMS.backToEdit`
   removed (unused).
4. **`/me` (P2)** — new registry `lib/cabinet/participant-widgets.ts` (ADR-009);
   `my-rides/components/UpcomingRegistrationsWidget.tsx` (3 upcoming, empty → «Найти заезд»
   button) and new module `features/participant/organizer-entry/` (organizer → «Перейти в
   кабинет» `/organizer`; 404 → create-profile offer; error → retry). `app/me/page.tsx` is
   now a Server Component rendering the registry; dead `CABINET_TERMS.homeEmpty*`/
   `organizerCtaLink` removed. New `PARTICIPANT_HOME_TERMS`.
5. **Featured (P2)** — `pickFeaturedRide` = soonest `isFeatureable` ride (open + route ≥2
   pts + start point + distance), no fallback → no featured card. `RideGridCard` without a
   route: compact head (status + «Маршрут пока не загружен», `RouteOff` icon) instead of an
   empty cover. `FeaturedRideCard`: unit wraps under the value at 390 (was clipped).
6. **Map degradation (P2)** — additive `MapRenderOptions.onBasemapUnavailable` (maps-core);
   `packages/maps-2gis/src/basemap-watch.ts`: fails on `styleloaderror`, `error` of type
   `invalidtilekey|styleloaderror|webglcontextlost`, no `styleload` in 10 s, or a `no-cors`
   probe of `https://tile0-sdk.maps.2gis.com/` failing (callWithResilience, 8 s, 2 attempts,
   shared breaker). Measured: blocked tiles emit no SDK error and `idle` can't distinguish;
   tiles load in a worker (no Resource Timing). Contract test checks the probe host.
   `DiscoveryMap`: `BasemapUnavailableNotice` over the map (top on phone clear of zoom,
   bottom-left on desktop) with «Повторить» → re-creates the map in place, filters/list
   untouched; failed render → same notice; missing key → old placeholder. `RouteMap`
   (ride page) falls back to its placeholder on basemap failure too.
7. **Organizer overview on a phone (P2)** — root cause: implicit `auto` grid track in
   `app/organizer/page.tsx` sized to a `truncate` title → page 768 px at 390. Now
   `grid-cols-1`; live-rides rows: title ≤2 lines (`line-clamp-2 wrap-anywhere`), date +
   action on the next line, actions `min-h-11`.
8. **a11y** — `packages/ui` `Dialog` returns focus to its opener on close (if still in DOM).

## Validation so far

- web unit 607+ ✔ (incl. new tests), ui 220 ✔, maps-2gis 72 ✔ (5 live skipped).
- `pnpm --filter web exec tsc --noEmit --incremental false` ✔; lint web/ui/maps-core/maps-2gis ✔.
- Storybook: `npx vitest run --project storybook` → 21 files / 131 stories ✔ (axe).
  New stories: `OrganizerDashboard`, `RideContextHeader`, `ParticipantHome`,
  `BasemapUnavailableNotice`; added `RideCard/NoRoute`, `RideManagement/FinishConfirmation`,
  `LiveRidesWidget/LongTitlesOnAPhone`. Storybook server restarted (6006) after ui changes.
- e2e: only `mobile-cabinets.spec.ts` run (6 ✔, incl. new "never scrolls sideways" test).
- Manual: screenshots 1280/390, dark + light (theme via `localStorage['coffee-ride-theme']`),
  keyboard: Tab → «Завершить заезд» → Enter → dialog focused → Escape closes; map
  «Повторить» via Enter re-creates the map. All pages `scrollWidth === innerWidth` at 390.

## Session 2 (2026-10-02) — progress on «Remaining»

- e2e full run (native): functional failures fixed —
  - `ride-lifecycle.spec.ts`: success texts matched `exact` (CR-184's «Ближайшее действие»
    hints start with the same words → strict-mode violation); new test «organizer confirms
    finishing a ride with unresolved riders».
  - That test found a real bug: `unresolved` came only from the page's first read, so a ride
    started on the same page finished with no dialog. `EditRideForm` now re-reads
    `attendanceSummary` after «Начать заезд» and before finishing (`requestFinish`); the
    button is not disabled during the re-read (a disabled button drops focus → Dialog can't
    return it). +2 unit tests.
  - `home.spec.ts:60`: with a key and the SDK blocked, the map now shows the CR-185 notice,
    not the placeholder → spec accepts either; `DiscoveryList` hides the fullscreen toggle
    while `[data-basemap-unavailable]` shows (not when already expanded).
  - `password-reset` failure = env (run e2e with root `.env`'s `DATABASE_URL` exported);
    `profile-visibility` failed once under parallel load, passed on rerun.
  - The native run wrote 12 `*-darwin.png` snapshots — deleted (never commit them).
- Review fix: `fetchOwnRide` rejects a non-owner's ride as `ride_not_found` (KI-069
  pattern) + 2 tests.
- Coverage: web +1.3 pp; `packages/ui` fell (21 untested term templates from CR-181..185)
  → new `packages/ui/src/terminology-ride-closing.test.ts`; api rides branches −0.32
  (CR-182's four unreachable `row?.x ?? 0`) → one `row ?? {…}` fallback.
- Docs done: changelog CR-185, tasks, project-state, architecture-map, rules/maps.md,
  rules/resilience.md (probe call site), design.md (§6 featured/card, §8 `/me`, dashboard
  order, RideContextHeader, §10 degraded map), known-issues KI-082/KI-083.
- Visual baselines: NOT regenerated — the amd64 `mcr…/playwright:v1.63.0-jammy` image
  never finished downloading (layers retried ~40 min; owner confirmed «не прошел»).
  Recorded as KI-084 (CI's screenshot specs fail until baselines are replaced). Temp DB
  `coffee_ride_snap` dropped, no container left.
- Final checks: functional e2e 43/43, Storybook 131 ✔, web/ui/api typecheck, lint of
  web/ui/api/maps-core/maps-2gis ✔, `coverage:check` ✔, baseline raised. Changelog
  archived (CR-115..CR-170 → `docs/changelog-archive/2026.md`, 15 live entries).

## Final result

Code, tests and docs for CR-185 complete and committed (with CR-184). Open: KI-084
(baselines), KI-082, KI-083. Committed and pushed on the owner's `/commit-push`.

## Remaining (do in order)

1. **Run e2e** `pnpm --filter web exec playwright test` (dev stack on :3000/:4000 is
   reused). Watch `e2e/ride-lifecycle.spec.ts:70/78` — finishing a ride with unresolved
   registrations now opens a dialog; if the spec's ride has participants, add a
   `confirmInDialog(page, 'Завершить')` step (helper in `e2e/helpers/ui.ts`).
2. **Visual baselines** will differ (`discovery-grid`, `ride-card`, `organizer-dashboard`,
   likely `themes` discovery): the seeded ride has no route → no featured card / compact
   card; KPI row moved below live rides. Regenerate per `.claude/rules/testing.md` (Docker
   amd64, or CI `*-actual.png` after checking diffs) — don't run Playwright natively for them.
   If not done now, record as a known issue.
3. **Coverage**: `pnpm test:coverage && pnpm coverage:check` with the live stack flags
   (memory: `coverage-needs-live-stack`); raise baseline if it went up.
4. **Docs/context** (CLAUDE.md protocol):
   - `docs/changelog.md` append CR-185 entry (what/why above, contract change
     `onBasemapUnavailable`, no migrations, no API changes, no new deps).
   - `.claude/context/project-state.md` overwrite snapshot.
   - `docs/tasks.md` add/check `CR-185`.
   - `.claude/context/architecture-map.md`: participant widget registry, `organizer-entry`
     module, `RideContextHeader`, `basemap-watch.ts`.
   - `.claude/rules/maps.md`: add `onBasemapUnavailable` to the render-contract snippet +
     one paragraph on the watch (rules file must match the code).
   - `docs/design.md`: `/me` widgets, featured rule, map notice, dashboard order (§8/§10).
   - `.claude/context/known-issues.md`: anything left (baselines, items under Found).
5. `git diff` review, then the closing report (Needs my input / Changed / Found). Commit
   only if the owner asks (`/commit-push`).

## Found (for the report)

- Catalog shows many `E2E заезд …` rides — dev-DB/environment data, not code (handoff
  says separate demo/E2E data from the user catalogue at environment level).
- Probe host `tile0-sdk.maps.2gis.com` is a 2GIS internal detail; guarded by the weekly
  contract test. A probe failure shows the notice even if MapGL could fall back.
- `UpcomingRegistrationsWidget` uses `when=upcoming` (`startsAt >= now`) — a ride the
  participant is on that already started isn't listed.
- The new mobile e2e passes even with the old grid because the rows now wrap; the grid
  fix is defence in depth (original 768 px overflow reproduced before the change).
- Dev data seeded for screenshots (organizer «Гравий по выходным», rides
  «Большой гравийный марафон…», «Гравий: круг по Серебряному бору» started,
  «Утро на Лосином острове» overdue) — dev DB only. Scratchpad scripts:
  `…/scratchpad/app.mjs` (+`seed.json`) screenshot key pages; copy into `apps/web` to run.
