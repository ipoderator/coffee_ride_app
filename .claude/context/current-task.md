# Current task

**CR-130 — «Ночной старт» (ADR-024): визуальное направление E v2**

## Goal

Implement the "Ночной старт" visual direction from the user-supplied mockup
(claude.ai/artifact/9m4BonFpJBtXBZYGbjWB4A v2), replacing ADR-021 («Топокарта»)
wholesale: new brand color (#82668C/#B8A0C1, supersedes CR-124's #9033A1/
#D79BE0), dark-by-default theme, pill/large-radius shape instead of 4px
"printed stamp", two new fonts (Unbounded, Sofia Sans Extra Condensed).
Also reverses parts of ADR-021 (discovery gets a card-grid tab alongside the
existing map tab, not a map-first-only view) and CR-108 (organizer sidebar
returns, still fed by the ADR-009 nav registry). User explicitly confirmed
all three reversals.

Full plan: `/Users/glebchurkin/.claude/plans/delightful-skipping-lovelace.md`.

**Checkpoint 2026-09-24**: user asked to commit progress so far and continue
in a fresh context window. Everything below through Phase 2 items 1-2 (and
half of item 4) is implemented, verified (test/typecheck/lint green,
browser-automation-checked), and about to be committed. Pick up at "Next
session starts here" below.

## Requirements / acceptance criteria

Phase 1 (foundation) — DONE:

- [x] ADR-024 in `docs/decisions.md`, supersedes ADR-021, documents CR-108 scope revision
- [x] `.claude/CLAUDE.md` "Brand color" section updated to new locked value
- [x] `packages/ui/src/tokens.css`: new `--primary`/`--brand`/`--primary-fill`(+hover)/`--on-primary-fill` roles, `--route`/`--map-*` move to `--brand` (KI-057 pinning kept), `--contour`→`--elevation` rename, new border tones, `@theme` gains `--font-unbounded`/`--font-sofia-extra-condensed`, new `--cover-*` tokens for `RouteCover`
- [x] `docs/design.md` §1/§3/§4/§5/§6/§9 updated
- [x] Fonts added in `apps/web/src/app/layout.tsx` (Unbounded, Sofia Sans Extra Condensed)
- [x] Default theme (empty localStorage) → dark, in `apps/web/src/lib/theme/theme.ts` (`'system'` now stored literally so it stays distinguishable from unset)
- [x] `app/icon.svg` hex updated to `--brand`
- [x] `Button` (fill roles, rounded-full, visible spinner), `StatusBadge` (palette only, no code change needed), `MetricTile`/`MetricRow` (extra-condensed numerals, optional `variant="cell"`), new `AvatarStack`, new `RouteCover` (+ `projectRoutePreviewToBox` in route-preview.ts), `Wordmark` moved to `fill-brand`
- [x] Phase 1 verification: `pnpm --filter ui/web test/typecheck/lint` all green; browser-automation confirmed dark-by-default renders (`bodyBg rgb(18,16,21)` = `#121015`) and new brand purple on Wordmark/headline numerals with no console errors

Phase 2 (screens) — PARTLY DONE:

- [x] Discovery: `DiscoveryTabs` switcher (Заезды/Карта) wired into `app/(public)/page.tsx`; "Заезды" = new `RideGrid`/`RideGridCard` (`RouteCover`-based) grid, its own fetch; "Карта" = unchanged `DiscoveryList`. Shared metric/status derivation extracted to new `discovery/lib/ride-metrics.ts` (`buildRideRowMetrics`, `ridesSeatsLabel`/`ridesSeatsLeft`, `discoveryStatusTerm` — the derived "Мало мест" chip), reused by `RideLegendRow` (refactored, behaviour unchanged) and `RideGridCard`. Bicycle-type filter reused as-is (`RideFilters`, native select) — did NOT rebuild as chips, judged not essential vs. risk/time. No participant avatars on cards — public endpoint, avoids leaking rider identity (see `RideGridCard`'s doc comment).
- [x] Ride detail: kept the real interactive `RouteMap` hero **on purpose** — a static `RouteCover` would regress real map functionality (route/stops/pins); this is a deliberate deviation from the plan's literal wording once the existing map-first architecture was understood, not an oversight. Added capacity fill-bar (`role="progressbar"`) next to existing seats-left text in `RegistrationButton`. Restyled `GroupPicker` rows to individually bordered/rounded instead of a divided flat list. Elevation chart already used the renamed `elevation` token from Phase 1.
- [x] Organizer (half of item 4): `CabinetShell` gained optional `sidebarNavItems` prop → new `CabinetSidebar` component, desktop-only, wired from `app/organizer/layout.tsx` via `filterEnabled(ORGANIZER_NAV_ITEMS)`; `/me/*` unchanged (prop omitted). `RideSummaryWidget`'s 4 KPIs now render as individual `MetricTile variant="cell"` panels instead of one shared `Card` — same real data (`OrganizerRideSummary`), no invented numbers.
- [ ] Organizer (rest of item 4): recent-registrations list + per-day bar chart — **not started**. Next session: check whether existing endpoints (participants list? `getOwnRideSummary`?) carry per-registration `createdAt` to aggregate client-side; if not, this is a documented `known-issues.md` entry, not a new API surface (plan's explicit boundary — no backend changes in this task).
- [ ] Mobile: bottom tab bar — **not started** (new component, 5 items: Заезды/Карта/+Создать/Мои/Я, mobile-only, likely lives in `app/layout.tsx` or a new `components/site/BottomTabBar.tsx`. Decide: does it replace `AppHeader`'s mobile disclosure panel, or coexist? Mockup shows tab bar only on mobile screens, no top header — recommend tab bar replaces the mobile nav portion of `AppHeader`, header logo/account stays).
- [ ] Mobile: countdown-to-start timer in `RegistrationButton`'s registered block — **not started** (pure client JS timer from `ride.startsAt`, days/hours/minutes, per mockup's "Вы едете" screen).
- [ ] Phase 2 final verification once the above are done: full repo `pnpm typecheck/lint/test`, manual/browser-automation check of both cabinets, night/day, desktop/mobile.

## Next session starts here

1. Data-availability check for organizer recent-registrations/bar-chart (see above).
2. Build the two remaining organizer widgets, or write the known-issue entry instead.
3. Build mobile bottom tab bar.
4. Build countdown timer in `RegistrationButton`.
5. Full-repo verification, then close out: flip CR-130 to `[x]` in `docs/tasks.md`,
   append a closing `docs/changelog.md` entry, overwrite `project-state.md`'s
   "Current task" section to "None active", and consider proposing a commit
   (only if/when the user asks, per `.claude/rules/git.md`).

## Planned files

See plan file's per-phase file lists for the original scope; the "Requirements"
checklist above now also lists exactly which files/components exist per item.

## Implementation progress

Phase 1 complete. Phase 2: discovery and ride-detail complete; organizer
sidebar + KPI panel complete; organizer activity feed/chart, mobile tab bar,
and countdown timer remain (see checklist above).

## Validation results

`pnpm --filter ui test/typecheck/lint` and `pnpm --filter web test/typecheck/lint`
all green after every step (final counts before this checkpoint: ui 23 test
files/137 tests, web 36 test files/338 tests). Browser-automation checks
against the local dev server (already running on :3000) confirmed: dark
theme applies by default with no stored preference; new brand purple renders
on Wordmark/headline numerals/route tracks; discovery tab switch and
`RouteCover` grid render with real route geometry (fixed the track
overlapping card text by confining the track to the box's upper ~60% and
strengthening the bottom scrim — `color-mix()`-based gradient); ride-detail
page shows the new `font-title`/`font-num` treatment, restyled `GroupPicker`,
and a working capacity fill bar. No console errors in any check beyond an
expected `401` on the anonymous `/api/v1/auth/me` probe.

## Discovered issues

None blocking. Noted for later polish, not blockers: the `RouteCover` grid
card's route track can still lightly overlap the title text on some real
route shapes even after the fix above — acceptable for v1, could iterate
further if the owner flags it.

## Final result

Pending — task not complete, checkpointed mid-Phase-2 at the user's request
to commit progress and continue in a new context window.
