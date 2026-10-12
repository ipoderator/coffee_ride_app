# Current task — CR-240..CR-243 — production QA items 6–9

Source: owner, 2026-10-12 (chat) — production browser QA items 6–9; reproduced and
fixed locally only (production neither tested nor changed). Branch
`fix/publish-saves-form`, committed, shared with CR-235..CR-239 (recorded in
`docs/changelog.md`).

## CR-240 — `AppHeader` mobile menu (item 6)

- Finding: the below-`md` panel is a bare disclosure: Escape does nothing, focus stays
  on the toggle when it opens and is not returned when it closes from inside, the page
  behind stays in the Tab order and the accessibility tree, a tap outside doesn't close
  it, and widening the window past `md` hides the panel while it stays "open".
- Acceptance: open → focus on the first item; Escape / toggle → closes, focus back on
  the toggle; while open everything outside the header is `inert` (keyboard + screen
  reader); tap outside closes; reaching `md` closes and restores the page.

## CR-241 — responsive (item 7)

- Findings (Playwright audit 320/390/989): `DiscoveryFilters` and `CabinetSectionTabs`
  scroll sideways with hidden scrollbars — filters fade a fixed right 15 %, so the last
  chip stays faded at the end of the row and a focused chip there is barely visible;
  the section tabs are cut hard on both edges with no cue. `OrganizerHeader` at 320 px
  pushes the avatar 9 px off-screen (page scrolls sideways). At 989 px `AppHeader`'s
  account trigger shows the full email, overflowing the page by 36 px, and «Мои заезды»
  wraps onto two lines.
- Acceptance: no horizontal page scroll at 320/390/989; scroll rows fade only an edge
  that actually hides content; a focused chip/tab scrolls fully into view; the email
  trigger truncates with the full address still available.

## CR-242 — share / `.ics` feedback (item 8)

- Findings: «Поделиться» falls to `navigator.clipboard` only — undefined outside a
  secure context and rejected in some webviews, then «Не удалось скопировать ссылку.»
  shows as a _success_ toast (default tone) with no way to get the link; a failed
  `navigator.share` (not AbortError) doesn't fall back to copying. «Добавить в
  календарь» gives no feedback at all and revokes the blob URL synchronously after
  `click()` (Firefox/Safari can lose the download).
- Acceptance: share → native sheet, else clipboard, else legacy copy, else a dialog with
  the link selected for manual copy; error toasts use the danger tone; `.ics` → success
  toast, danger toast on failure, data-URL fallback where `download` is unsupported.

## CR-243 — small items (item 9)

- Stale group counter: `GroupsEditor`'s conflict paths (`group_not_found`,
  `group_limit_reached`, `group_has_registrations`) resync the list only — the
  workspace chip stays «3 из 6» over 2 groups (repro: delete a group removed in
  another tab). Out-of-order workspace re-reads can also land an older count.
- `fitBounds`: `applyFit` passes any coordinates through and fits a hidden (0×0)
  container with padding larger than the map — drop invalid points, defer the fit until
  the container has a size, clamp padding.
- `OrganizerHeader`'s account heading sits inside `role="menu"` as `role="none"` text —
  move it out of the menu (NavMenu `header` slot).
- Theme options: `menuitem` + `aria-current` → `menuitemradio` + `aria-checked`.
- Missing visible focus: `RescheduleRideCard`'s form heading (`focus:outline-none` on
  the programmatic focus target) and `DiscoveryFilters` (see CR-241).

## Planned files

- `apps/web/src/components/site/{AppHeader,ThemeToggle}.tsx`, `components/cabinet/
{OrganizerHeader,CabinetSectionTabs}.tsx`, new `lib/site/` helpers
- `apps/web/src/features/participant/discovery/components/DiscoveryFilters.tsx`
- `apps/web/src/features/participant/ride-detail/{components/RideDetailView.tsx,lib/calendar.ts}`
- `apps/web/src/features/organizer/{groups/components/GroupsEditor.tsx,rides/components/{RideWorkspace,RescheduleRideCard}.tsx}`
- `packages/ui/src/components/NavMenu.tsx`, `packages/ui/src/terminology.ts`
- `packages/maps-2gis/src/render.ts`; tests and stories for each

## Progress

- [x] CR-240 [x] CR-241 [x] CR-242 [x] CR-243 [x] validation [x] close-task

## Validation results

- web unit 929/929, ui 272/272, maps-2gis 82/82 (+6 live skipped); `coverage:check`
  passes (maps-2gis statements first fell −0.17 pp on an unreachable `return` —
  removed the duplicate pre-check, now +0.05).
- New tests failing on `HEAD` sources: AppHeader mobile menu ×4, OrganizerHeader
  heading/radios, ride-detail calendar ×2 + share ×3, groups ×2, rides «overlapping
  re-reads», maps-2gis fitBounds ×3, reschedule heading focus (trivial), NavMenu ×2.
- tsc (web/ui/maps-2gis), eslint 0 errors (warnings = KI-092), prettier clean.
- Storybook 288/293: the 5 known failures only (AdminOverview ×3, CabinetSectionTabs
  Admin Last Tab ×2 — same on the `HEAD` component). New stories: AppHeader
  MobileMenuOpen/AccountAndThemeMenus, OrganizerHeader ×2, NavMenu ×2,
  ShareLinkDialog ×2, RideDetailView ×2.
- e2e chromium/mobile: themes, mobile-cabinets (updated for `lg`), critical-journeys,
  ride-lifecycle, pace-groups — all pass except themes' 2 darwin screenshot checks (no
  darwin baselines by design; generated files deleted).
- Local app (Playwright, scratchpad `qa/{audit,rows,verify,groups-stale}.mjs`): no
  page overflow at 320/390/768/989/1024; menu focus/inert/Esc/outside/resize; share
  manual dialog, clipboard copy, `.ics` download + toast; reschedule heading ring
  (`:focus-visible`, 2px solid); org menu heading outside `role="menu"`.
- Not run: mobile visual baselines (need CI artifact after a push); api untouched.

## Final result

Items 6–9 fixed and validated locally; committed on `fix/publish-saves-form`, PR into `main`.
