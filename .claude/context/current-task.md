# Current task

**CR-131 — Organizer dashboard brought to the «Ночной старт» mockup (screen 4)**

## Goal

Close the gaps between `/organizer` and the ADR-024 mockup's screen 4, found
by a side-by-side check after CR-130. Frontend-only, existing endpoints only.
Owner decisions (2026-09-26): do every "no backend change" item; sidebar
«Участники»/«Обновления» lead to the **nearest ride's** pages (option б);
no «Статистика» item; the shared site header stays (CR-108 not reversed).

## Requirements / acceptance criteria

- [x] KPI cells = mockup set, each with a sub-line:
      Ближайший («N дн» + `вс 04.10 · 09:00`), Записано (`N/M` + «+N за
      сутки», for the nearest ride), Лист ожидания (total, all rides),
      Рейтинг (`4,8` + «N отзывов»). Cells fill the row (4 columns on desktop).
- [x] Page top: organizer name as eyebrow, time-of-day greeting, secondary
      «Отправить обновление» → nearest ride's updates page (hidden with no
      nearest ride). No-profile state keeps a «create profile» CTA.
- [x] Profile card removed from the dashboard (still reachable via sidebar).
- [x] Sidebar: «Обзор» first item with active highlight; panel look
      (built as a rounded `bg-raised` panel — the shell's account bar sits
      above, so the mockup's full-height bordered column became a card); new registry items
      «Участники» (`/organizer/participants`) and «Обновления»
      (`/organizer/updates`) that resolve to the nearest ride client-side,
      with an empty state when there is no upcoming ride.
- [x] «Записи по дням»: calendar week пн–вс, label «эта неделя», peak day
      highlighted (counts stay printed for a11y).
- [x] Tests updated/added; web/ui typecheck, lint, tests green; browser check.
- [x] Docs: changelog, tasks, design §8, project-state, architecture-map.

## Planned files

- `apps/web/src/lib/organizer/nearest-ride.ts` (+test) — shared nearest-ride lookup
- `apps/web/src/features/organizer/overview/` — header + KPI widget (replaces
  `RideSummaryWidget` and `OrganizerProfileWidget` on the dashboard)
- `apps/web/src/app/organizer/{participants,updates}/page.tsx` + redirect component
- `features/organizer/{participants,updates}/nav.ts` — registry descriptors
- `CabinetSidebar.tsx`, `app/organizer/page.tsx`, `organizer-widgets.ts`,
  `organizer-nav.ts`, `lib/cabinet/icons.ts`
- `features/organizer/activity/lib/activity.ts` + widget — calendar week/peak
- `packages/ui/src/terminology.ts`

## Implementation progress

Done 2026-09-26. All planned files built; `features/organizer/activity/api.ts`
folded into `lib/organizer/own-rides.ts` (renamed from the planned
`nearest-ride.ts` once it held the shared reads too).

## Validation results

web/ui typecheck + lint clean; tests ui 147/147, web 369/369; browser check
(dark/light, 1280/390, sidebar redirects) with temporary API data, deleted.

## Discovered issues

- Mockup's «Участники» count badge needs live data in a static registry — out
  of scope (registry items are server-built plain data); noted, not built.

## Final result

Complete, uncommitted. Transferred to: `docs/changelog.md` (CR-131 entry),
`docs/tasks.md`, `docs/design.md` §8, `project-state.md`,
`architecture-map.md`, KI-066 update.
