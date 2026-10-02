# Current task — CR-187: ride workspace («Управление заездом», 6 tabs) — DONE (committed)

Spec: `~/Documents/ChatGPT/КофеРайд/coffee-ride-ux-review/RIDE_MANAGEMENT_VISUAL_SPEC.md` + `index.html` (tab «Управление»).
Frontend only — no API/schema/migration change. Committed together with CR-186.

## Done

- `features/organizer/rides/components/RideWorkspace.tsx`: the frame for every `/organizer/rides/[id]/*` page.
  - Reads `GET /v1/rides/:id` plus the latest update (`getLatestRideUpdate`, `rides/api.ts`) and checks `isOwner`.
  - Owns the lifecycle steps, the finish ConfirmDialog and the result line.
  - Head: status, overdue badge, mono date, h1 = ride title, actions in priority order.
  - Tabs: `RideWorkspaceTabs.tsx` — underline from `lg`, grid 3×2 below (6×1 from `md`).
  - Section head: h2, purpose line, readiness chip.
  - Children are keyed by ride status. `variant="wizard"` drops the back link and the tabs.
- Context: `lib/cabinet/ride-workspace.ts` (`useRideWorkspace()`, `null` outside the frame).
- Readiness registry: `features/organizer/*/readiness.ts`, collected in `lib/cabinet/organizer-ride-readiness.ts`, plus `groups/editable.ts`. `RideSectionLink` gained optional `title`/`description`.
- Overview tab:
  - `EditRideForm.tsx` = draft: «Перед публикацией» checklist + form (h2 «Редактирование заезда»).
  - Non-draft = `RideOverview.tsx` (`RideReadinessList`, facts, contact/visibility/next step, cancel).
- Route tab: lock `Notice`, `RouteTrackSketch.tsx` (provider-free sketch with a legend), «Скачать GPX», track facts. Stops/points lost their warnings; the «добавьте» copy shows only on a draft.
- Cover tab: 16:9 preview, file rules, lock `Notice` after publish.
- Groups tab: no delete on an occupied group, one rules line, lock `Notice` on finished/cancelled; `ORGANIZER_GROUPS_TERMS.hint` removed.
- Participants tab:
  - `Notice` before the start;
  - card renamed «Записались»;
  - group headings are h4;
  - times in the ride's timezone.
- Updates tab:
  - recipients line and a live preview;
  - Russian validation, cleared on typing;
  - `role="alert"` on errors;
  - a `Notice` instead of the composer on a draft.
- `packages/ui`: new `Notice` (with test). Terminology: new `RIDE_WORKSPACE_TERMS`, `RIDE_READINESS_TERMS`, `RIDE_SECTION_HEAD_TERMS`; retired `RIDE_CONTEXT_TERMS`, `manageTitle`, `nextActionTitle`, `summary*`, `sectionsTitle`, `settingsTitle/Hint`.
- Six pages wrapped in `RideWorkspace`.
- Removed:
  - `RideSectionNav` (CR-186) and its story;
  - `RideContextHeader` (CR-185) with its test and story;
  - `fetchOwnRide` with its test.
- Tests:
  - `rides.test.tsx` (wrapper + block `RideWorkspace (CR-187)`);
  - new `organizer-ride-readiness.test.ts`;
  - groups/cover/participants/route/updates tests updated;
  - e2e `access-control.spec.ts`: a non-owner gets `notFoundTitle` on the participants page.
- Stories: `RideManagement`, `RideWorkspaceSections`, `Notice`, fixture `ride-workspace-fixtures.ts`.
- `docs/design.md` §8 (route table + «Ride workspace (CR-187)») and §9 (`Notice`).

## Validation (final, 2026-10-02)

- web unit 620/620, ui 230/230; `web`/`ui` tsc and `web` eslint clean; prettier clean
  on every changed file (incl. `docs/*.md`).
- Storybook 145/145 with axe (new `RoutePublishedMismatch`).
- e2e chromium, every spec except `visual-regression` and the `visual baseline` blocks:
  40/40 (`password-reset` needs `DATABASE_URL` from the root `.env` exported).
- Screenshots: 4 statuses × tabs × 390/1280 × dark/light (earlier session) + the
  published mismatch at 1280 light / 390 dark — no horizontal scroll.

## Final result

All «Remaining» steps done. Last-session additions: a published ride's ride/track
mismatch is a neutral reference line (`RIDE_ROUTE_TERMS.metricsMismatchLocked`, no
sync button), story + test updated; `terminology.ts` prettier-formatted. Context files
updated: `docs/changelog.md` (CR-187), `docs/tasks.md`, `docs/design.md` §8,
`project-state.md`, `architecture-map.md`, `known-issues.md` (KI-085).

## Found

- ~~Track-vs-ride mismatch warning on a published ride~~ — fixed: neutral reference line.
- The sidebar lights «Участники» on the participants tab, not «Заезды» (CR-150 behaviour, unchanged).
- Each tab does an extra `GET /v1/rides/:id` (frame + section) — KI-085.
- Times used to render in UTC (the formatter's default). Inside the frame they now use the ride's timezone.
- Draft-form field errors are English Zod messages (pre-existing) — KI-085.
- Coverage baseline not regenerated (needs the live stack).
- KI-084 visual baselines (CR-185) still pending; CR-187 doesn't touch visual-regression screens.
- Storybook (:6006) and `next dev` (:3000, clean `.next`) were restarted in the background.
