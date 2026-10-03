# Changelog

Append-only log of completed tasks. Never edit or delete past entries — only append.

This file exists because `.claude/context/project-state.md` is a **snapshot** (overwritten
each time) and git history is not always convenient to read inline. This file is the
human/agent-readable long-term memory of "what happened, in what order, and why."

Newest entries at the bottom.

## Archiving (keep this file cheap to read)

When this file exceeds ~40 entries, move all but the most recent ~15 into
`docs/changelog-archive/YYYY.md` (one file per year), preserving order and content exactly.
Leave a one-line pointer at the top of this file's history section noting the archive exists.
Commands (`/next`, `/status`) only need to read the last 5-10 entries of the _live_ file —
the archive exists for humans and for deep audits, not for routine agent context.

## Format

```
## YYYY-MM-DD — CR-XXX — short title
Summary: what changed, in 1-3 sentences.
Files: key files/dirs touched.
Decisions: link to docs/decisions.md entry if an ADR was created, otherwise "none".
Follow-up: anything deferred, or "none".
```

---

Entries before CR-171 (CR-000 through CR-170, 2026-09-09..2026-10-01) were moved
to `docs/changelog-archive/2026.md` (CR-000..CR-076 on 2026-09-20, CR-079..CR-114
on 2026-09-26, CR-115..CR-170 on 2026-10-02), per this section's own rule — the live
file had grown past ~40 entries again.

## 2026-10-01 — CR-171 — The discovery map as the main emotional layer

Summary: the owner asked to make the map the main emotional layer of `/`: a soft
draw-in of the route when a ride card is chosen, a pulse of the start point, and
unobtrusive elevation/difficulty markers right on the line. All three are in,
behind additive `maps-core` contract fields implemented only in the 2GIS adapter.

- **Route draw-in** (`MapPolylineInput.drawInMs`, 900 ms): MapGL's `Polyline` has
  no `setCoordinates`, so the adapter rebuilds the line's prefix every animation
  frame (`linePrefix`, by length, ending on an interpolated point), creating the
  new object before destroying the old so it never blinks. The pace is constant
  along the line — so a note `f` of the way along is reached at `f × 900 ms`. An
  update _without_ `drawInMs` mid-draw continues the running draw on the new
  points: the full stored geometry arriving ~120–300 ms after the ≤ 40-point
  preview no longer restarts or pops the line. `DiscoveryMap` starts a draw only
  when the active ride changes (hover, focus or pin), not on a theme switch.
- **Start pulse** (`MapMarkerInput.pulse`, `'ring'`): three soft rings expand and
  fade out of the pin (Web Animations API, inline — no stylesheet shipped), then
  stop. Finite on purpose: WCAG 2.2.2, and CR-170's "no loops" rule stands.
- **Notes on the line** (`shape: 'tag'`, `meter`, `revealDelayMs`): a tick on the
  point and a small paper pill above it in `--map-route` ink — the difficulty word
  with the §6 segment meter halfway along the line, and «▲ 214 м» at the summit
  once the full geometry shows a climb of ≥ 30 m whose top is not at either end
  (`lib/route-highlights.ts`). Non-interactive (`pointer-events:none`, below every
  pin) and faded in as the drawing line reaches them; each note keeps the delay it
  was first given, so a later update never re-fades it.
- **Marker reconciliation**: `setMarkers` now reconciles by `id` — an unchanged
  marker keeps its SDK object, a moved one is moved in place, only a changed look
  is rebuilt; repeated ids still get their own marker. Without this, the summit
  note appearing (or any unrelated update) recreated every pin and cut the pulse.
  Transparent for the ride page and the route builder.
- Reduced motion: no draw, no pulse, no reveal — all shown at once.

Verified live against the dev stack with the MapGL key (software WebGL in headless
Chromium): the line draws progressively, the chosen start pulses, «Средний» and
«▲ 192 м» sit on the Krylatskoe route; the Patriarshie loop correctly gets no
summit (its top is in the first 1 % of the route, on the start pin). Console
errors seen there are pre-existing: the anonymous session check's 401 and 2GIS
asset DNS failures (KI-056).

Validation: `apps/web` unit 538 passed (5 new DiscoveryMap cases + 6 for
`route-highlights`); `packages/maps-2gis` 62 (11 new: reconciliation, pulse, tag,
reveal, draw-in with a fake frame clock, `linePrefix`); `packages/ui` 212;
Storybook 90; `apps/api` 546 on the live stack; typecheck + lint green. Coverage
holds (`maps-2gis` +3.6 pp lines, `apps/web` +0.4 pp); baseline regenerated.

No story for the map effects: they are drawn by the 2GIS adapter's own DOM inside
a live MapGL map, which Storybook cannot render (no key, and stories may not import
`maps-2gis` — `.claude/rules/maps.md`'s lint rule). Covered by the adapter's unit
tests and the live check above.

Decisions: none needing an ADR — additive contract fields, same precedent as
CR-112/CR-118.

## 2026-10-01 — CR-172 — Frame the whole route when a ride is selected

Summary: after CR-171 the owner chose to frame the selected route instead of
CR-170's pan to its start. With only a pan (zoom unchanged), a long route — the
69,5 km Krylatskoe ride — drew mostly off-screen, and its difficulty/summit notes
with it. Selecting a ride on `/` (a pin click or a focused row; a hover still never
moves the camera) now eases the camera to fit the start plus the route: the cached
full geometry when it is already here, otherwise the preview, whose bounds match to
within metres. One move per choice — the full geometry arriving later does not
re-fit. A ride without a route keeps the eased pan to its start. Both moves are
600 ms (was 450), a jump under reduced motion.

Contract: `MapFitOptions.durationMs` (additive) — the 2GIS adapter passes MapGL's
`animation` option (`easeOutCubic`, or `animate: false` for 0), also for the
single-point center/zoom case; omitted, the SDK call is byte-for-byte what it was.
A re-fit after a container resize strips the duration: it is a correction, not a
move. `.claude/rules/maps.md` and `docs/design.md` §5 "Motion" updated.

Verified live: selecting the Krylatskoe ride frames the whole loop with both notes
(«Средний», «▲ 192 м») and the pulsing start in view.

Validation: `apps/web` unit 539 (camera tests rewritten for fit/pan/cached
line/hover/reduced motion); `packages/maps-2gis` 65 (animated fit, jump,
single-point, resize re-fit immediate); typecheck + lint green; coverage holds,
baseline regenerated.

## 2026-10-01 — CR-173 — «Журнал организатора» on the ride page

Summary: the trust layer gets plain facts about the organizer's past rides, shown
as a quiet ledger (no stars, badges or verdict colours) under «Журнал организатора»
on `/rides/[id]`. What already existed: average rating + review count (CR-043,
inline beside the organizer name — left as is). What is new: rides held, share
completed, typical pace/distance, usual bike types.

API (additive): `organizer.journal` on `GET /v1/rides/:id` only (one aggregate pair
per request; the list does not carry it) — `finishedCount`, `cancelledCount`,
`completionPercent`, `typicalPaceKmh`, `typicalDistanceKm`, `bicycleTypes`
(`modules/rides/organizer-journal.ts`). Only `finished`/`cancelled` rides count;
pace/distance are medians over finished rides, bike types the top two excluding
`any`. Honesty rules: `completionPercent` stays `null` until 3 rides are closed
(`ORGANIZER_JOURNAL_MIN_CLOSED_RIDES`) — the UI then names the cancellation in
words instead; no finished rides reads «Завершённых заездов пока нет», never a 0 %.
No schema/migration change.

Web: `OrganizerJournal` (ride-detail feature) + `ORGANIZER_JOURNAL_TERMS`
(`packages/ui`); story `Rides/OrganizerJournal` (3 states, axe-clean).

Validation: `apps/api` rides+reviews 257 passed (new `organizer-journal.routes.test.ts`
covers empty / mixed finished+cancelled+draft / thin sample; one strict `organizer`
equality in `rides.routes.test.ts` gained `journal`); `ride-detail` 87; Storybook
story 3; typecheck + eslint clean for types/ui/web/api. Coverage baseline not
regenerated this run.

Known limits / next: the organizer's own cabinet profile does not show the journal
yet; the discovery list carries only rating (no journal) by design (cost).

## 2026-10-02 — CR-174 — «Показать ещё» on the discovery map list

Defect (reported by the owner, confirmed): `DiscoveryList` — the map tab's list and
the source of its pins — read only `response.items` of `GET /v1/rides`, ignoring
`nextCursor`/`total`, so with more than one page (default 20) the rest of the rides
were unreachable from the map view. `RideGrid` (the grid tab) already paginated.

Fix: `DiscoveryList` now keeps `nextCursor`/`total`, renders the same
«Показать ещё N заездов» button under the rows (error: `loadMoreError`, loaded rows
kept), and appends the next page with the first page's exact query (`queryRef`);
a generation counter drops a late page for filters the user has since changed.
Every loaded ride is pinned on the map. No API/contract change.

Validation: `discovery.test.tsx` +3 (append with cursor and button gone at the end,
all loaded rides pinned, next-page failure keeps rows and shows the error);
`apps/web` discovery 98 passed; typecheck + eslint clean for the folder.

## 2026-10-02 — CR-175 — Discovery filters survive the «Заезды / Карта» switch

Defect (reported by the owner, confirmed): `DiscoveryTabs` mounts only the active
view, and each of `RideGrid` / `DiscoveryList` kept the filter chips in its own
`useState`, so every tab switch reset them to «none».

Fix: the chips now live in `DiscoveryTabs` and are passed down (`filters` /
`onFiltersChange`; a view rendered alone still falls back to its own state —
`lib/use-discovery-filters.ts`). They also mirror into the URL like `view` does
(`?type=&week=1&pace=&difficulty=&free=1`, `history.replaceState`), so a choice
survives a reload and a shared link; unknown/out-of-range values are dropped on read
(`filtersFromSearchParams`). No API change.

Validation: `DiscoveryTabs.test.tsx` +2 (filters kept across both switches, in the
URL and in the next fetch; restore from URL ignoring a malformed `pace`),
`discovery-filters.test.ts` +2 (round trip, bad values); `apps/web` suite, typecheck
and eslint for the folder clean.

Known limit: URL changes made elsewhere (back/forward) do not re-sync the chips —
`replaceState` adds no history entries, so back leaves the page entirely.

## 2026-10-02 — CR-176 — A real first paint on `/`

Finding (owner, confirmed): the prerendered `/` had `<main>` with an empty Suspense
fallback (`fallback={null}`), so the server HTML carried no content and the page was
blank until `DiscoveryTabs` hydrated and `RideGrid` fetched.

Change: the fallback is now `DiscoveryPageSkeleton` — the real page title and
description (static text, so first paint has content and no layout jump), plus quiet
`Skeleton` blocks for the view switch, the filter chips and the cards, laid out like
`RideGrid`'s own header and loading state. `RideGrid`'s loading cards moved to the
same file (`DiscoveryGridSkeleton`) so the two cannot drift. Skeletons keep the
existing `motion-safe` pulse. Verified in the dev server's HTML: `<main>` now holds
the `h1` and placeholders. No API change.

Not done (a separate decision): server-side prefetch of the first page. `/` is
statically rendered and its filters come from the URL, so prefetching would make the
route dynamic (or need an ISR/cache layer plus a server-side API base URL) — a real
cost/caching trade-off. The skeleton fixes the blank first paint; prefetch would
additionally remove the post-hydration fetch wait.

Validation: `DiscoveryPageSkeleton.test.tsx` (+1); `apps/web` 644 passed; typecheck
and eslint clean. Not eyeballed in a browser; a `?view=map` visit briefly shows the
grid-shaped skeleton before the map layout (the view is unknown until hydration).

## 2026-10-02 — CR-177 — Keyboard-operable «Список / Карта» tabs

Finding (owner, confirmed): the switch was marked `role="tablist"` but had no
arrow-key handling, no roving tabindex and no `tabpanel`. A second, worse effect:
the switch is rendered inside whichever view is mounted, so a tab change destroys
and recreates it and a keyboard user's focus dropped to `<body>`.

Change (`DiscoveryTabs`): WAI-ARIA tabs with automatic activation — ←/→ (and ↑/↓)
move and select, wrapping; Home/End jump to the ends; only the selected tab is in
the Tab order; each tab has an `id`, the selected one `aria-controls` the panel;
focus is restored to the new tab after the view swaps. The tab panel
(`role="tabpanel"`, `aria-labelledby` = the active tab) is the results region of
the active view (`RideGrid`'s cards / `DiscoveryList`'s rows) — the switch sits in
the view's header, so the panel cannot wrap it; the map pane beside the list is not
inside it. Both views take an optional `panelProps`. No visual change.

Validation: `DiscoveryTabs.test.tsx` +3 (roving tabindex + panel wiring, arrows with
focus following and wrap, Home/End and ignored keys); `apps/web` 647 passed;
typecheck and eslint clean. No screen-reader pass done.

## 2026-10-02 — CR-178 — organizer rating links to the reviews section

Summary: on `/rides/[id]` the «★ 4,7 · 3 отзыва» line under the title is now an `#reviews` anchor. The «Отзывы» section is rendered for every ride; before the ride is `finished` it shows a note (`REVIEWS_TERMS.notFinished`) instead of fetching the list, since ride reviews exist only after the finish while the header figure aggregates the organizer's past rides.
Files: `apps/web/src/features/participant/ride-detail/components/RideDetailView.tsx`, `ride-detail.test.tsx`, `packages/ui/src/terminology.ts`.
Decisions: none (option 1 of the owner's choice; a public organizer page / `GET /v1/organizers/:id/reviews` stays out of scope, `docs/api.md`).
Follow-up: the header count and the section's list can differ (organizer total vs this ride) — a public organizer reviews page would remove that.

## 2026-10-02 — CR-179 — restore the coverage gate after CR-174..CR-177

Summary: CI on `46af87b` failed only at «Coverage gate» (`packages/ui` lines/statements/functions, `apps/api/src/modules/rides/` branches). Added tests for the untested CR-165/CR-173 code: `formatRideContactValue` email case, every `ORGANIZER_JOURNAL_TERMS` formatter, and the journal's bicycle-type tie-break / `any` exclusion. Baseline untouched.
Files: `packages/ui/src/format.test.ts`, `packages/ui/src/terminology.test.ts`, `apps/api/src/modules/rides/organizer-journal.routes.test.ts`.
Decisions: none.
Follow-up: `organizer-journal.ts` `row?.finished ?? 0` fallbacks are unreachable (an aggregate always returns a row); raise the baseline after a CI-like full run.

## 2026-10-02 — CR-180 — brand empty states

Summary: empty states became next steps. Discovery (grid and map list): «Рядом пока тихо» + «Создать заезд» link; filtered: «Под эти фильтры заездов пока нет» + hint to widen dates/pace/difficulty + «Сбросить фильтры» (there is no radius filter, so no «увеличьте радиус» copy). Organizer ride list: «Здесь пока тихо» + contour drawing. `ContoursIllustration` (topographic rings) moved from the discovery feature into `packages/ui` so both cabinets share it (extensibility rule: no feature-to-feature import).
Files: `packages/ui/src/components/ContoursIllustration.tsx` (+test), `packages/ui/src/terminology.ts`, discovery `RideGrid`/`DiscoveryList`, organizer `RidesList`, `apps/web/src/stories/EmptyState.stories.tsx`, affected tests.
Decisions: none.
Follow-up: the remaining ~12 small `EmptyState` uses (cabinet tables, notifications, my-rides) keep their plain copy; roll the illustration/copy out there if wanted.

## 2026-10-02 — CR-181 — finish check-in: participant claim, organizer confirms in bulk

Summary: a rider reports «Отметить финиш» once the ride has started; the organizer's participants page shows claims and confirms them selectively («Подтвердить» / «Не пришёл» / «Вернуть» per row) or in one click («Подтвердить всех заявивших (N)»). A claim stays a claim: the organizer-owned `attendance` is a separate field. **Breaking (additive fields, tightened rule):** `POST /v1/rides/:id/reviews` now needs `attendance = 'finished'` (`403 finish_not_confirmed`); the review form appears only for a confirmed finisher and a hint explains the wait. Migration `0023_registration_attendance` adds `finish_claimed_at`, `attendance` (enum), `attendance_marked_at/by` with a consistency CHECK, and backfills `finished` for active registrants of already-finished rides so existing reviewers keep access (dev and test DBs migrated).
Files: `packages/db` (schema, migration 0023), `packages/types` (`Registration`, `RideParticipantSummary`, attendance request/response), `apps/api/src/modules/registrations/` (service, routes, `attendance.routes.test.ts` 13 tests), `reviews.service.ts` (+test updates), `apps/web` organizer `ParticipantTable`/`attendance.ts`, participant `RegistrationTicket` (`FinishCheckIn`) and `RideDetailView`, `packages/ui` `FINISH_CHECKIN_TERMS`, four new `RegistrationTicket` stories, `docs/api.md`/`database.md`.
Decisions: ADR-027.
Follow-up: no notification on a decision; an organizer who never confirms blocks reviews (auto-confirm after N days is the candidate fix); `ParticipantTable` still has no Storybook story (it fetches); coverage baseline not regenerated (needs the live stack, KI-070); no Playwright spec for the flow yet.

## 2026-10-02 — CR-182 — ride closing: «сошёл», results summary, close-with-unconfirmed

Summary: extends CR-181 per the owner's proposal. New outcome `dnf` («сошёл», migration `0024_attendance_dnf`, a «Сошёл» row action and badge, a read-only state on the rider's ticket). `GET /v1/rides/:id` gains additive `attendanceSummary { finished, dnf, noShow, unresolved }` (null before the start). Finishing a ride is still allowed with undecided riders: the organizer sees a warning before and a note after, and the closed ride's page shows «Итоги заезда» — «Финишировали: N из M» plus «Не подтверждено: K — итоги ещё не закрыты» — instead of reading as «everyone finished». `dnf` cannot review.
Files: `packages/db` (enum, migration 0024), `packages/types`, `apps/api/src/modules/rides/rides.service.ts` + `rides.routes.ts` (summary), `attendance.routes.test.ts` (+3 API tests), web `ParticipantTable`, `EditRideForm`, `RideDetailView` (`FinishResults`), `RegistrationTicket`, `FINISH_CHECKIN_TERMS`, one story, docs.
Decisions: ADR-028.
Follow-up: unresolved is computed, not stored, so a closed ride's historical «not confirmed» state is not frozen; no batch «mark all remaining as no-show» yet; still no notification, Playwright spec or coverage-baseline refresh.

## 2026-10-02 — CR-183 — organizer dashboard: rides under way and upcoming rides

Summary: `/organizer` now lists the organizer's own `started` rides as «Заезды сейчас» cards (finish-control progress bar, state legend, up to 3 rows with claims first, one-click «Подтвердить» via CR-181's `PUT /v1/rides/:id/attendance`) and their next published rides as «Ближайшие заезды». Nothing is rendered when there are neither. No API, schema or contract change — existing `GET /v1/rides/mine` and `/participants`.
Files: `apps/web/src/features/organizer/live-rides/` (new module + tests), `lib/cabinet/organizer-widgets.ts` (registry, order 20), `packages/ui/src/terminology.ts` (`ORGANIZER_LIVE_TERMS`), `stories/LiveRidesWidget.stories.tsx`.
Decisions: none.
Follow-up: the block sits under the KPI tiles (the widget registry orders whole widgets; the mockup puts it above them — splitting the overview widget would fix that); the participant preview reads one page of 100; the «Следующий заезд» strip shows title/start only, no registered count.

## 2026-10-02 — CR-184 — ride management view, «Требует решения», honest finish-control bar

Summary: three findings from the owner's organizer-screen audit, all confirmed in code.
(1) `/organizer/rides/[id]/edit` for a non-draft ride rendered the whole form disabled under «Редактирование заезда», lifecycle buttons after it. It now opens as «Управление заездом»: status + title, «Ближайшее действие» (hint per status + the one lifecycle button, primary), a short summary (start, distance, «Записано N из M», price), section links, then «Что можно изменить» (participants visibility + contact — the only settings the API still accepts) and a separate «Отмена заезда» card. A draft keeps the full form under «Редактирование заезда». `EditRideForm` now renders the page `h1` (status-dependent); `RIDE_EDIT_TERMS.notEditable` removed (unused).
(2) A ride still `published`/`registration_open`/`registration_closed` with a past start fell out of every overview block (`upcomingRides` drops past starts; `liveRides` needs `started`). The dashboard widget gained a «Требует решения» list (`overdueRides`) with the past start and «Перейти к управлению»; the management view shows the same warning. Nothing changes status automatically.
(3) `LiveRidesWidget`'s bar used all active registrations as the denominator but had no `no_show` segment, under the label «На старте». Now «В списке», five segments (финиш подтверждён / заявка на финиш / без итога / сошёл / не стартовал) that sum to the list, plus «Итоговый статус у N из M». The undecided row state reads «Без итога» instead of «На маршруте».
Files: `apps/web/src/features/organizer/rides/components/EditRideForm.tsx`, `rides/api.ts` (optional `registrationsCount` on the edit read), `rides.test.tsx`, `app/organizer/rides/[id]/edit/page.tsx`, `features/organizer/live-rides/{lib/live-rides.ts,components/LiveRidesWidget.tsx,live-rides.test.tsx}`, `packages/ui/src/terminology.ts`, `stories/RideManagement.stories.tsx` (new), `stories/LiveRidesWidget.stories.tsx`.
Decisions: none (frontend only; no API/schema change — `registrationsCount` was already in `GET /v1/rides/:id`).
Validation: web unit 585 passed, ui 219 passed, web typecheck/lint clean, Storybook story tests incl. axe (9 stories) passed; screenshots checked at 1280/390.
Follow-up: the dashboard's participant tally still reads only the first 100 registrations.
Addendum (same day, owner: «нужна»): `/organizer/rides` marks the same rides — a «Требует решения» warning badge beside the status plus «Время старта прошло, а заезд не начат…»; the status itself is untouched. The rule now lives once in `apps/web/src/lib/rides/overdue.ts` (`isRideOverdue`, + test), used by the dashboard, the list and the management view. New `stories/RidesList.stories.tsx` (grouped / needs decision / empty / error). Web unit 589 passed, ui 219, typecheck/lint clean, story tests pass.

## 2026-10-02 — CR-185 — UX handoff P1/P2: active work first, finish confirmation, ride context, `/me` widgets, featured rule, map degradation

Summary: the owner's UX handoff (base `5404297`), every P1/P2 row, on top of CR-184; ride lifecycle and API unchanged.
(1) Organizer dashboard: active work above the KPIs. `features/organizer/overview` split into the head (`OrganizerOverviewWidget`: greeting, «Отправить обновление», no-profile/error states) and `OrganizerKpiWidget` (registry order 25, after live rides at 20); both read one load through `hooks/useOverviewData.ts` (a small `useSyncExternalStore` store: the head's retry reloads both, reset when the last subscriber unmounts). `LiveRidesWidget` order: «Заезды сейчас» → «Требует решения» → «Ближайшие заезды».
(2) «Завершить заезд» with undecided riders opens a `ConfirmDialog` naming the count («Вернуться» / «Завершить»); with every outcome final there is no dialog. The count is re-read (`GET /v1/rides/:id` → `attendanceSummary`) after «Начать заезд» and before finishing — found by the new e2e test: a ride started on the same page used to finish with no question, since the page's first read predates the start.
(3) A ride's participants and updates pages open with `RideContextHeader` (title, start, status, «Требует решения», «Управление заездом →»); new `fetchOwnRide` in `lib/organizer/own-rides.ts`.
(4) `/me` renders a participant widget registry (`lib/cabinet/participant-widgets.ts`, ADR-009): «Ближайшие заезды» (three upcoming registrations; empty → «Найти заезд») and the new `features/participant/organizer-entry/` module (organizer → «Перейти в кабинет»; no profile → create-profile offer; error → retry). Replaces the old stub that offered a profile even to existing organizers.
(5) Discovery's featured card only for a ride open for registration with a route (≥ 2 points), a start point and a distance — no fallback. A grid card without a route gets a compact head («Маршрут пока не загружен», `RouteOff`) instead of an empty cover; the featured card's unit wraps under its value at 390 px instead of clipping.
(6) Map degradation. **Contract (additive):** `MapRenderOptions.onBasemapUnavailable` (`packages/maps-core`). `packages/maps-2gis/src/basemap-watch.ts` reports a basemap that never draws: fatal SDK `error` types, `styleloaderror`, no `styleload` in 10 s, or a failing `no-cors` probe of the tile host through `callWithResilience` (8 s, 2 attempts, shared breaker). Blocked tiles emit no SDK event and load inside MapGL's worker — measured — hence the probe. `DiscoveryMap` shows «Карта недоступна» over the map (top on a phone, clear of zoom; bottom-left on desktop) with «Повторить», which re-creates only the map; an outright render failure gets the same notice, a missing key keeps the old placeholder; the fullscreen toggle hides while the notice shows (KI-078). `RouteMap` falls back to its placeholder.
(7) Organizer dashboard on a phone: the page was 768 px wide at 390 — an implicit `auto` grid track sized to a `truncate` title. `grid-cols-1`; live-ride titles clamp to two lines, date and action on the next line, actions `min-h-11`.
(8) `packages/ui` `Dialog` returns focus to its opener on close (when still in the DOM).
(9) Coverage gate (pre-existing CR-181..CR-184 debt, surfaced by this run): `packages/ui` had 21 untested term templates → `terminology-ride-closing.test.ts`; `apps/api` rides branches fell 0.32 pp on CR-182's four unreachable `row?.x ?? 0` in `getAttendanceSummary` (a `count(*)` aggregate always yields one row) → one `row ?? {…}` fallback, same behaviour; two more `Dialog` focus tests. `coverage-baseline.json` raised (live stack, `coverage:baseline`; `modules/auth` kept at its floor, −0.08 pp noise in untouched code). `fetchOwnRide` treats someone else's published ride as `ride_not_found` (the public `GET /v1/rides/:id` answers 200, KI-069).
Files: `apps/web` — `features/organizer/{overview,live-rides,rides}/…`, `features/participant/{discovery,my-rides,organizer-entry,ride-detail}/…`, `components/cabinet/RideContextHeader.tsx`, `lib/cabinet/{participant-widgets,organizer-widgets}.ts`, `lib/organizer/own-rides.ts`, `app/{me,organizer}/…`, new stories (`OrganizerDashboard`, `RideContextHeader`, `ParticipantHome`, `BasemapUnavailableNotice`) and story variants, e2e `ride-lifecycle.spec.ts` (new finish-confirmation test; success texts matched exactly, CR-184's hints start with the same words), `home.spec.ts` (accepts the new notice), `mobile-cabinets.spec.ts` (never scrolls sideways); `packages/maps-core/src/render.ts`; `packages/maps-2gis/src/{basemap-watch,render}.ts` (+tests, contract test checks the probe host); `packages/ui` (`Dialog`, `terminology.ts`: `PARTICIPANT_HOME_TERMS`, `FINISH_CHECKIN_TERMS.finishConfirm*`, basemap terms; removed unused `CABINET_TERMS.homeEmpty*`/`organizerCtaLink`, `RIDE_UPDATES_TERMS.backToEdit`); `docs/design.md`, `.claude/rules/{maps,resilience}.md`.
Decisions: none new (frontend + an additive maps-core option, same precedent as CR-112/CR-118/CR-171). No migrations, no API contract change (only the internal `rides.service.ts` simplification in (9)), no new dependencies.
Validation: web unit + Storybook story tests (131, axe) + ui/maps-2gis/api tests green; typecheck/lint clean; functional e2e 43/43 (with the root `.env` `DATABASE_URL`); `coverage:check` passes with the live stack. Visual baselines not regenerated (KI-084).
Follow-up: KI-082 (probe host is a 2GIS internal detail), KI-083 (`/me` hides a ride under way), KI-084 (screenshot baselines — CI e2e fails until replaced). Demo/E2E rides in the dev catalogue are environment data — separate them at the environment level, as the handoff asks.

## 2026-10-02 — CR-186 — «Разделы» on the ride management view as icon rows

Summary: owner's request — the «Разделы» block on «Управление заездом» was one wrapped line of purple text links («Маршрут → Обложка → Группы → Участники → Обновления →») that read as a sentence, not as navigation. It is now a grid of rows (1 column on a phone, 2 from `sm`, 3 from `xl`): an icon tile (`primary-tint`/`primary`), the section name, a one-line hint of what the sub-page holds, and a chevron. Pattern adapted from 21st.dev's «Preferences Card» (icon tile + title + hint + chevron) — not installed: no framer-motion (`docs/design.md` §5 Motion: hover only changes colours), project tokens instead of shadcn's, the chevron always visible (no hover on a phone).
Contract (additive, `apps/web` only): `RideSectionLink` gained optional `icon` (a `CABINET_ICONS` name — the descriptors cross the Server→Client boundary) and `hint`; each ride-section descriptor sets both, so `RideSectionNav` has no per-section branching (ADR-009). `CABINET_ICONS` gained `Route`, `ImageIcon` (lucide) and `AccountAdd` — «Группы», the owner's pick on 21st.dev: Material Line Icons' `account-add` (line-md, MIT, Copyright 2020 Vjacheslav Trushkin; notice in `apps/web/src/lib/cabinet/licenses/MIT-line-md.txt`), as a static `AccountAddIcon` component (the set's SMIL draw-in dropped, §5 Motion). `CABINET_ICONS` now `satisfies` a structural icon type (`className` + `aria-hidden`) instead of `LucideIcon`.
Terminology: `RIDE_EDIT_TERMS.{route,cover,participants,updates}Link` and `ORGANIZER_GROUPS_TERMS.rideEditLink` lost their literal « →» (a screen reader read it as part of the link name); new `…LinkHint` strings. The draft form's inline section links next to the status badge keep the arrow as an `aria-hidden` `ArrowRight` icon. Each row link is named by its label and described by its hint (`aria-labelledby`/`aria-describedby`, ids from `useId`).
Files: `apps/web/src/features/organizer/rides/components/{RideSectionNav,EditRideForm}.tsx`, `apps/web/src/lib/cabinet/{types,icons}.ts`, `apps/web/src/lib/cabinet/{AccountAddIcon.tsx,licenses/MIT-line-md.txt}`, `apps/web/src/features/organizer/{route,cover-image,groups,participants,updates}/ride-section.ts`, `packages/ui/src/terminology.ts`, `apps/web/src/stories/{RideSectionNav,RideManagement}.stories.tsx`, `apps/web/src/features/organizer/rides/rides.test.tsx`, `docs/design.md` §8.
Decisions: none new. No migrations, no API change, no new dependencies.
Validation: web unit 612/612 (new CR-186 test: row named by label, hint as accessible description, one row per registry entry); Storybook story tests 135/135 with axe; `web`/`ui` typecheck and `web` lint clean; screenshots checked dark 1280 and light 390.

## 2026-10-02 — CR-187 — Ride workspace «Управление заездом»: one frame, six tabs, readiness

Summary: the owner's UX review (tab «Управление», `RIDE_MANAGEMENT_VISUAL_SPEC.md`) — a ride's organizer pages read as six unrelated screens. `features/organizer/rides/components/RideWorkspace.tsx` now frames every `/organizer/rides/[id]/*` page: status badge (+ «Требует решения» when overdue), mono start line, the title as `h1`, lifecycle actions in priority order (the frame owns the steps, the finish `ConfirmDialog` and the result line), six local tabs (`RideWorkspaceTabs.tsx`: «Обзор» + the ride-section registry; underlined from `lg`, a bordered 3×2 grid below, 6×1 from `md`) and a section head (h2, purpose line, readiness chip). `?wizard=1` drops the back link and tabs. «Обзор»: a draft is «Перед публикацией» (checklist + form); a non-draft ride is `RideOverview.tsx` — a readiness checklist (`RideReadinessList.tsx`), «Данные заезда», «Связь с участниками», the cancel card. After publishing, sections show results instead of disabled forms: route — a lock `Notice`, `RouteTrackSketch.tsx` (provider-free sketch of the stored geometry, start/finish in a legend), «Скачать GPX», the track facts, and a ride/track distance mismatch as a neutral reference line (the yellow note with «Использовать данные трека» stays on a draft, where it can be acted on); cover — a 16:9 preview with the file rules; groups — an occupied group says «Есть участники — удалить нельзя» instead of offering delete; participants — a notice before the start, «Записались», registration times in the ride's timezone (they rendered in UTC before); updates — recipients line, live preview, Russian validation with `role="alert"`, a notice instead of the composer on a draft.
Supersedes: CR-186's `RideSectionNav` (+ story) and CR-185's `RideContextHeader` (+ test, story) and `lib/organizer/own-rides.ts`'s `fetchOwnRide` (+ tests) — removed; the frame replaces both. CR-186's `RideSectionLink.icon`/`.hint`, `CABINET_ICONS` additions and `AccountAddIcon` stay (the checklist rows use them).
Contract (`apps/web` + `packages/ui`): `RideSectionLink` gained optional `title`/`description` (additive). New readiness registry — each section module's `readiness.ts`, collected in `lib/cabinet/organizer-ride-readiness.ts`; `groups/editable.ts` is the one «can groups change» rule; context `lib/cabinet/ride-workspace.ts` (`useRideWorkspace()`, `null` outside the frame). `packages/ui`: new `Notice`. Terminology: new `RIDE_WORKSPACE_TERMS`, `RIDE_READINESS_TERMS`, `RIDE_SECTION_HEAD_TERMS`, `RIDE_ROUTE_TERMS.metricsMismatchLocked`; **removed** (breaking for `packages/ui` consumers, every caller updated in this change — `apps/web` is the only one): `RIDE_CONTEXT_TERMS`, `RIDE_EDIT_TERMS.{manageTitle,nextActionTitle,summary*,sectionsTitle,settingsTitle,settingsHint}`, `ORGANIZER_GROUPS_TERMS.hint`.
Files: `apps/web/src/features/organizer/rides/components/{RideWorkspace,RideWorkspaceTabs,RideOverview,RideReadinessList,EditRideForm}.tsx`, `apps/web/src/features/organizer/rides/api.ts`, `apps/web/src/features/organizer/{route,cover-image,groups,participants,updates}/{readiness,ride-section}.ts`, `apps/web/src/features/organizer/groups/editable.ts`, section components (`RouteUploadForm`, `RouteTrackSketch`, `StopsSection`, `RoutePointsSection`, `CoverImageUploadForm`, `GroupsEditor`, `ParticipantTable`, `WaitlistTable`, `UpdateComposer`), the six `app/organizer/rides/[id]/*/page.tsx`, `apps/web/src/lib/cabinet/{ride-workspace,organizer-ride-readiness,types}.ts`, `apps/web/src/lib/organizer/own-rides.ts`, stories `RideManagement`, `RideWorkspaceSections`, `Notice` + `ride-workspace-fixtures.ts`, `packages/ui/src/{components/Notice.tsx,terminology.ts,index.ts}`, `docs/design.md` §8/§9.
Decisions: none new (ADR-009 registry pattern, frontend only). No migrations, no API change, no new dependencies.
Validation: web unit 620/620 (new `organizer-ride-readiness.test.ts`, `RideWorkspace (CR-187)` block in `rides.test.tsx`, section tests updated), ui 230/230; `web`/`ui` typecheck and `web` lint clean; Storybook story tests 145/145 with axe (new `RoutePublishedMismatch`); e2e chromium against the local stack, every spec except `visual-regression` and the `visual baseline` blocks — 40/40 (`password-reset` needs the root `.env` `DATABASE_URL` exported); `access-control.spec.ts` gained «a non-owner gets not-found on the participants page». Screenshots: 4 statuses × tabs × 390/1280 × dark/light, no horizontal scroll, title/status/date/actions above the fold at 390 px.
Follow-up: KI-085 (a second ride read per tab, English Zod messages on the draft form, sidebar highlight on the participants tab). KI-084 still pending; CR-187 changes no visual-regression screen. Coverage baseline not re-measured (needs the live stack).

## 2026-10-02 — CR-188 — KI-085 follow-ups: one ride read per tab, Russian field errors, red `main` CI

Summary: worked through CR-187's leftover list. (1) Every ride-workspace tab now reads `GET /v1/rides/:id` once: sections take the ride from `useRideWorkspace()` when the frame is there and re-read through its `refresh()` — `RouteUploadForm` (state via the new `route/api.ts` `routeStateOf`, a change refreshes the workspace instead of a second read), `CoverImageUploadForm` (starts from the workspace's copy; its cache-busted URL stays local), `useRideGroups(rideId, knownRideStatus?)`, `ParticipantTable`/`WaitlistTable` (groups + status). The participants tab went from four ride reads to one; standalone (tests, stories) the sections still read on their own. (2) No form shows a Zod `issue.message` any more — the English text `packages/types` writes for the API (an emptied draft title read «Title cannot be empty.»). New `apps/web/src/lib/forms/field-errors.ts` words the failed check from its code and bounds via the new `VALIDATION_TERMS` (`packages/ui`): «Заполните это поле.», «Не длиннее 140 символов.», «Не может быть меньше нуля.», «Введите целое число.»…; a field's own shape rule keeps its wording (`RIDE_CONTACT_VALUE_ERRORS` by contact type, the profile phone, the start point's lat/lng pair, the review rating); a server `validation_error` entry shows that wording or «Проверьте это поле.». Applied to all eleven forms that echoed `issue.message` (ride create/edit/overview contact, login, register, forgot/reset password, profile, garage, organizer profile, stops, route points, updates, review), not only the draft form. `CreateRideForm` also maps a server error at `contact.value` onto the contact field now (it was dropped). (3) `playwright.config.ts` loads the root `.env` the way `apps/api/src/server.ts` and `next.config.ts` do (environment wins, missing file is fine): `password-reset.spec.ts` failed locally unless `DATABASE_URL` was exported, because a reused dev API wrote to the `.env` database while the seeding fixture used the default one — verified failing without the change, passing with it. (4) The «622 vs 620» web tests: 622 was recorded at 15:48:54 in CR-187's first session, and its `fetchOwnRide (CR-185)` block (2 tests) was deleted at 15:50 in the same session, before the 620 run — no test was lost. (5) `RideWorkspaceTabs`: on a 320–360 px phone a third of the strip is narrower than «Обновления», which broke as «Обновле-ния»; under 21rem of nav width the grid is 2×3 (a container query in rem, so larger text moves the switch too). At 390 px the real page already fit — the earlier report came from Storybook's narrower frame.
Found and fixed on the way: `main` CI was red. CR-187's run failed the **coverage gate** — `apps/web` −0.72 pp lines (its new story fixture `src/stories/ride-workspace-fixtures.ts` counts at 0 %, `RouteTrackSketch` had no unit test) and `packages/ui` −3.11 pp lines / −7.06 pp functions (CR-187's terminology functions untested) — and CR-185's run failed e2e on six screenshots (KI-084). Coverage was raised with tests, not by lowering anything: new `route-track-sketch.test.tsx`, `terminology-ride-workspace.test.ts`, participants readiness cases, `field-errors` tests; `coverage-baseline.json` raised for `apps/web` (78.70 → 78.99 lines, 77.29 → 77.51 branches, …) and `packages/ui` (statements 99.54 → 99.56, branches 93.08 → 93.32) only — the other packages were not re-measured and were left untouched. KI-084: the six `*-linux.png` baselines replaced with CI run 37022093199's `*-actual.png` after checking every `*-diff.png` (only CR-185's intended changes; «ride card» now captures the grid card itself — `a[href^="/rides/"]` matched the featured card's button before). `route-points-stops.spec.ts` (the «passed only on retry» flake in project-state): after a save, the edit/delete buttons looked enabled but the busy guard silently dropped a click until the section's `onChange` re-read finished — failed 2/12 on unchanged code under `--repeat-each`; `StopsSection`/`RoutePointsSection` now disable their row actions while a change saves (16/16 after).
Contract: `packages/ui` gained `VALIDATION_TERMS`, `RIDE_CONTACT_VALUE_ERRORS` (additive). `useRideGroups` gained an optional second argument. No API, schema or `packages/types` change; no migrations, no new dependencies.
Files: `apps/web/src/features/organizer/{route,cover-image,groups,participants}/…` (section components, `route/api.ts`, `groups/hooks/useRideGroups.ts`), `apps/web/src/features/organizer/rides/{field-errors.ts,components/{EditRideForm,CreateRideForm,RideOverview,RideWorkspaceTabs}.tsx}`, the auth/profile/garage/organizer-profile/updates/review forms, `apps/web/src/lib/forms/field-errors.ts`, `apps/web/src/test-support/ride-workspace.tsx`, `apps/web/playwright.config.ts`, `apps/web/e2e/helpers/db-fixtures.ts`, `apps/web/e2e/visual-regression.spec.ts-snapshots/*` (6), `apps/web/src/stories/RideContactFields.stories.tsx`, `packages/ui/src/terminology.ts`, `coverage-baseline.json`, `docs/design.md` §8/§10.
Validation: web unit 651/651, ui 238/238; `web`/`ui` typecheck and lint clean; prettier clean on changed files; Storybook 145/145 with axe; e2e chromium (all specs except `visual-regression` and the `visual baseline` blocks) 40/40 twice, without `DATABASE_URL` exported; `mobile` functional specs 3/3; `route-points-stops` 16/16 under `--repeat-each 8`; `coverage:check` for `apps/web` (79.00/77.49/77.09/77.51) and `packages/ui` (100/99.56/100/93.32) at or above the raised floor. Tabs measured on the real page at 320/360/375/390/414/768/1280 px: every label fits its cell.
Follow-up: KI-084 closes once CI's e2e step is green on the replaced baselines. KI-086 (split from KI-085): which sidebar item lights on a ride's participants/updates tab — an owner decision.

## 2026-10-03 — CR-190 — Reschedule a published ride before its start

Summary: owner QA report `QA_13653ed` item 2 (P1). An organizer can move a published, not-yet-started ride to a new date/time with a required reason: «Дата и время старта» card on the workspace «Обзор» → form (date, time in the ride's zone, reason, «было → станет», who will be notified) → `ConfirmDialog` → `POST /v1/rides/:id/reschedule`. One transaction moves `rides.starts_at` and writes a `RideUpdate` with from/to + reason (audit trail); after the commit every active registrant and every waiting waitlist entry gets a «Заезд перенесён» notification with «Было/Стало». The ride page and ticket say «Перенесён, было …» with the reason; `/me` and organizer lists read the new start; the `.ics` gets `SEQUENCE` = reschedule count with the same `UID`. The «Например: старт перенесён на 9:00» placeholder of «Обновления» is gone (now a meeting-point example plus a hint linking to the reschedule), as are the same example strings in tests.
Contract (additive): new endpoint; `GetRideResponse.rescheduleCount`/`lastReschedule`; `RideUpdate.reschedule`, `Notification.reschedule`; `ConfirmDialog` optional `children`; `RIDE_RESCHEDULE_TERMS`; `ride_rescheduled` job. Migration `0025_ride_update_reschedule` (two nullable `timestamptz` columns + two CHECKs). No new dependencies.
Files: `apps/api/src/modules/{rides/{rides.routes,rides.service,reschedule.routes.test}.ts,notifications/{notifications.service,notification-response.schema}.ts}`, `packages/db/{src/schema/ride-update.ts,migrations/0025_*}`, `packages/types/src/{api/rides,domain/{ride-update,notification}}.ts`, `packages/ui/src/{terminology.ts,terminology-reschedule.test.ts,components/ConfirmDialog.tsx}`, `apps/web/src/features/organizer/{rides/components/{RescheduleRideCard,RideOverview,RideWorkspace}.tsx,rides/reschedule-ride-card.test.tsx,updates/…}`, `apps/web/src/features/participant/{ride-detail,notifications}/…`, stories `RescheduleRideCard`, `RegistrationTicket.RegisteredRescheduled`, `docs/api.md`.
Validation: api 587/587 (17 new reschedule tests: authz incl. other organizer/participant/cross-site, lifecycle gate, past/unchanged start, atomic audit row, GET exposure, fan-out to registrants + waitlist, enqueue-after-commit, queue down → direct delivery, failed fan-out keeps the move) on a fresh DB migrated through `0025`; `drizzle-kit check`/`generate` — no drift; web/ui/types unit green; Storybook stories (new + RideManagement + RegistrationTicket) 25/25 with axe; workspace typecheck + lint clean.
Decisions: ADR-029.
Follow-up: no e2e journey for the reschedule yet (covered at API integration + component level); coverage gate not re-measured locally (needs the live Redis/S3 stack); no email for a reschedule (in-app only, like other ride updates).

## 2026-10-03 — CR-191 — `seed:demo` finishes rides the CR-181 way; `pnpm lint` without pnpm's hoist

Summary: owner QA report `QA_13653ed` items 3–4 (P1). (3) `pnpm seed:demo --no-routes` died on the first review with `403 finish_not_confirmed`: since CR-181 (ADR-027) a review needs the organizer's confirmed finish, and the seed went straight from `start` to `finish` to `reviews`. A finished seed ride now goes through the real API flow — finishers claim (`POST /finish-claim`) while `started`, the organizer confirms them (`POST /attendance/confirm-claimed`) and records the other outcomes (`PUT /attendance`: one «сошёл» on «Вечерние Воробьёвы горы», one no-show on «Гравий: Одинцово — Звенигород»), then `finish`, then reviews (an existing review is skipped). The plan is validated before the reset (an outcome for an unregistered rider, a review from a non-finisher, outcomes on an unfinished ride fail fast). Re-runs stay duplicate-free: the reset already removes every `@demo.coffeeride.local` account and its rides, whatever step the previous run stopped at. (4) `apps/web`'s ESLint resolved `eslint-config-next`'s plugins only through pnpm's private hoist (`NODE_PATH`); `FlatCompat` now resolves plugins from `eslint-config-next`'s own location, and `packageExtensions` declares its undeclared `next` peer (its parser requires `next/dist/compiled/babel/eslint-parser`).
Contract: none (no API, schema or migration change). New dev dependencies in `packages/db`: `vitest`, `@vitest/coverage-v8`, `vite`, `config` (workspace) — `packages/db` now has a `test` script.
Files: `packages/db/src/{seed-demo.ts,seed-demo-finish.ts,seed-demo-finish.test.ts}`, `packages/db/{package.json,vitest.config.ts}`, `apps/web/eslint.config.mjs`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `README.md`.
Validation: on a disposable DB behind an isolated API (:4191): a clean run, then runs killed after the accounts, mid-riders, after 3 rides and inside the finished rides' attendance steps — each followed by a full re-run with exit 0 and identical counts (11 accounts, 9 rides, 31 registrations, 2 waitlist, 7 reviews, 3 updates, attendance finished 7 / dnf 1 / no_show 1, no duplicate titles); the pre-fix seed reproduced `403 finish_not_confirmed` on the same API. `packages/db` unit 11/11; workspace typecheck + lint clean; `apps/web` ESLint clean with `NODE_PATH` unset; `pnpm install --frozen-lockfile` consistent.
Decisions: none.
Follow-up: `packages/db` is not in `coverage-baseline.json` yet (the gate only checks listed packages) — add it with the next `pnpm coverage:baseline` on the full CI stack.

## 2026-10-03 — CR-192 — Publishing without a route asks first; a ride update reports its real recipients; the wizard ends at publish

Summary: owner QA report `QA_13653ed` items 5, 6, 9 (P2/P3). (5) A ride can still be published without a route — the route stays optional — but since the route is draft-only (`docs/api.md`) it can never be added afterwards, so «Опубликовать» on a draft without a route now opens `PublishWithoutRouteDialog` («Опубликовать без маршрута?»): «Опубликовать без маршрута» publishes, «Добавить маршрут» leads to the route tab (the wizard's route step inside the wizard), Esc/backdrop stays on the form. `EditRideForm`'s draft form is the only publish point in `apps/web` (wizard step 4 and the workspace's «Обзор» both render it); with a route, publishing goes straight through as before. (6) «Обновление отправлено участникам» was shown even with nobody registered: `POST /v1/rides/:id/updates` now also returns `recipientsCount` (active registrants at send time, counted before the insert), and the composer says «Обновление опубликовано; получателей пока нет.» or «Обновление отправлено: получат N записавшихся участников.» (Russian plurals). (9) The overview hint «Меняются только способ связи и видимость списка» was wrong — pace groups are editable until the ride is finished/cancelled; it now lists groups (up to 6, only an empty one can be deleted), the contact, list visibility and, merged with CR-190, the start date/time through the reschedule before the start; a finished/cancelled ride gets its own hint. Publishing from the new-ride wizard («Новый заезд · шаг 4 из 4») now leaves the wizard for the ordinary six-tab workspace (`router.replace` to `/organizer/rides/:id/edit`, success as a toast that survives the navigation).
Contract: additive — `CreateRideUpdateResponse.recipientsCount` (`packages/types`, optional on the type so older mocks still type; the API always sends it), `docs/api.md` updated. `packages/ui`: `RIDE_UPDATES_TERMS.sendSuccess` is now a function `(recipients?: number) => string` (every caller updated in this change); new `RIDE_EDIT_TERMS.publishNoRoute*`, `RIDE_WORKSPACE_TERMS.factsHintClosed`; `contactHintPublished` no longer claims nothing else is editable. No schema change or migration.
Files: `apps/api/src/modules/notifications/notifications.{service,routes,routes.test}.ts`, `apps/web/src/features/organizer/rides/components/{EditRideForm,RideOverview,PublishWithoutRouteDialog}.tsx`, `apps/web/src/app/organizer/rides/[id]/edit/page.tsx`, `apps/web/src/features/organizer/updates/components/UpdateComposer.tsx`, `apps/web/src/features/organizer/{rides/rides,updates/updates}.test.tsx`, `apps/web/src/stories/{RideManagement,RideWorkspaceSections}.stories.tsx`, `apps/web/e2e/{critical-journeys,notifications,ride-lifecycle}.spec.ts`, `packages/types/src/api/notifications.ts`, `packages/ui/src/{terminology.ts,terminology-ride-workspace.test.ts}`, `docs/api.md`.
Validation (rebased on CR-190/191): `web`/`api`/`ui`/`types` typecheck + lint clean; web unit 682/682; ui 245/245; api 588 passed / 8 skipped (live S3/Redis) on a disposable DB; Storybook `RideManagement` + `RideWorkspaceSections` 28/28 with axe; e2e chromium `critical-journeys`/`notifications`/`ride-lifecycle` 8/8 on isolated ports. No screenshot baseline covers the changed screens.
Decisions: none (route stays optional — owner's QA wording).

## 2026-10-03 — CR-194 — Validation errors in Russian on every form, guarded

Summary: owner QA report `QA_13653ed` item 8 (P2). KI-085/CR-188 already routed field errors through `fieldErrorMessage`/`serverFieldErrorMessage`; this closes the remaining gaps and pins it down. `ReviewForm` silently refused a too-long comment (no line on screen) and ignored a server rejection of `comment` — it now shows the field's Russian line, and a `validation_error` naming neither field falls back to «Не удалось отправить отзыв». Account forms (register, login, forgot/reset password) say «Введите email, например name@example.ru.» — their field is labelled «Email» — while the ride contact's «Почта» keeps «Введите адрес почты…» (`VALIDATION_TERMS.contactEmail`). Every form (register, login, password reset, organizer profile, ride create/edit, route points/stops, groups, updates, garage, review) has tests that feed it the API's real English `title`/`detail`/`errors[].message` and assert none of it reaches the screen. A guard test (`apps/web/src/lib/forms/russian-errors-guard.test.ts`) fails the build if app source ever reads a Zod issue's/`problem.detail`/`error.message` text into the UI, if a `<form>` lacks `noValidate` (browser-language bubbles), or if a control carries native `required`/`pattern`; it also runs every shared `*Schema` from `packages/types` against junk input and requires a Russian line for each issue code. The ride registration panel and CR-190's reschedule card already map every code to Russian copy.
Contract: `packages/ui` — `VALIDATION_TERMS.email` reworded, new `VALIDATION_TERMS.contactEmail` (`RIDE_CONTACT_VALUE_ERRORS.email` now points at it). No API, schema or migration change — the API keeps English problem+json for machines; the web never shows it.
Files: `apps/web/src/features/participant/ride-detail/components/ReviewForm.tsx` (+ `review-form.test.tsx`), the auth/organizer/participant form tests, `apps/web/src/lib/forms/{field-errors.test,russian-errors-guard.test}.ts`, `apps/web/src/test-support/english-problem.ts`, `apps/web/src/stories/{FormErrors,Input,RideContactFields}.stories.tsx`, `packages/ui/src/{terminology.ts,terminology.test.ts}`.
Validation (rebased on CR-190/191/192): `web`/`ui` typecheck + lint clean; web unit 728/728; ui 245/245; Storybook 170/170 with axe (new «Forms/Validation errors», light + dark).
Decisions: none.

## 2026-10-03 — CR-193 — «Предстоящие» without cancelled/finished rides; the catalog's archive section

Summary: owner QA report `QA_13653ed` item 7 (P2). (a) `/me` and `/me/rides` listed a cancelled and a finished ride with future dates under «Предстоящие». `GET /v1/registrations/mine` now splits by ride status first, date second: `upcoming` = not `finished`/`cancelled` and (`startsAt >= now` or `started` — a ride under way stays until the organizer finishes it, same rule as CR-183's «Заезды сейчас»); `past` is its exact complement, so a still-future-dated cancelled/finished ride leads the history (`startsAt desc`). `/me/rides`' second tab is «История» (it now holds cancelled rides of next week too). `/me`'s widget keeps a cancellation in sight: cancelled rides whose date is still ahead are listed under «Отменены организатором» (best-effort second read of `when=past`). (b) The catalog mixed finished/cancelled rides in with open ones and showed «Осталось N мест» on them. `GET /v1/rides` gained an optional `phase=active|archive`; both views (`RideGrid`, `DiscoveryList`) read `active` for the list/featured card/map pins and `archive` for a collapsed «Завершённые и отменённые» section under it (own «Показать N заездов»/«Показать ещё», hidden when empty or while loading, inline retry on failure). The two views' duplicated fetch/«Показать ещё» logic moved into `usePublicRides` + `ShowMoreRides`. Cards and rows show seats left only while registration is open: a published-but-not-open ride says «Запись ещё не открыта», closed says «Запись закрыта», started/finished/cancelled show no seats block (`rideCardSeats` → `null`).
Contract: additive — `GET /v1/rides?phase=active|archive` (omitted → both, as before); `packages/types` `ARCHIVED_RIDE_STATUSES`, `isArchivedRideStatus`, `RIDE_LIST_PHASES`. Behaviour change (documented in `docs/api.md`): `GET /v1/registrations/mine?when=` is status-first — the only caller is `apps/web`, updated in this change. `packages/ui`: `RIDE_DISCOVERY_TERMS.{registrationNotOpenNote,archive*}`, `PARTICIPANT_HOME_TERMS.cancelledLabel`, `MY_REGISTRATIONS_TERMS.tabPast` «История» + empty-state copy. No schema change or migration.
Files: `apps/api/src/modules/{registrations/registrations,rides/rides}.{service,routes.test}.ts`, `apps/web/src/features/participant/discovery/{api.ts,lib/{use-public-rides,ride-metrics}.ts,components/{DiscoveryList,RideGrid,RideGridCard,FeaturedRideCard,RideLegendRow,ArchivedRidesSection,ShowMoreRides}.tsx}` + tests, `apps/web/src/features/participant/my-rides/components/UpcomingRegistrationsWidget.tsx` + test, `apps/web/src/stories/{RideFilters,RideCard,ParticipantHome}.stories.tsx`, `packages/types/src/{api/rides,domain/ride}.ts`, `packages/ui/src/terminology.ts`, `docs/api.md`.
Validation (rebased on CR-190/191/192/194): workspace typecheck + lint clean; web unit 748/748; ui 245/245; api 592 passed / 8 skipped (live S3/Redis) on a disposable DB; Storybook 175/175 with axe (new `InListWithArchive`, `RegistrationNotOpen`/`Started`/`Finished` cards, `/me` `CancelledAhead`); e2e chromium 37 passed — the 4 GPX/media-upload specs failed only because no local S3 was running, the 5 `visual-regression` specs have no macOS baselines by design. The discovery screenshots' mock filters the `archive` request to zero rides, so the section never renders there; CI confirms the Linux baselines.
Decisions: none (status-first split and «Отменены организатором» follow the QA wording; a `started` ride staying «upcoming» follows CR-183).

## 2026-10-03 — CR-189 — The ride workspace follows finish marks without a reload; isolated e2e ports; QA `13653ed` integration

Summary: owner QA report `QA_13653ed` item 1 (P1). After the organizer marked the last undecided rider, the workspace frame kept «Не подтверждено: 1», the readiness chip and the «нет итогового статуса» line until a reload: `ParticipantTable` updated only its own list while `RideWorkspace` holds its own `attendanceSummary`. Every attendance save (a mark, «Вернуть», «Подтвердить всех заявивших», and a failed save) now awaits `useRideWorkspace()?.refresh()` — buttons stay disabled until the frame has re-read, so fast clicks can't race stale replies; standalone (no frame) nothing changes. The one-off «Заезд завершён, но у N участников…» note now reads the live count and becomes «Заезд завершён.» at zero.
Also (lead, before the QA work was split across worktrees): `apps/web/playwright.config.ts` takes `E2E_WEB_PORT`/`E2E_API_PORT` so a run starts its own api/web against a disposable `DATABASE_URL` instead of reusing a developer's :3000/:4000 servers and their data (`reuseExistingServer` only matches the port it waits on); the api gets `WEB_ORIGIN` for that port, the web `API_INTERNAL_URL`; `e2e/helpers/{api-fixtures,ui}.ts` follow it. Unset, everything is as before (CI unchanged).
Integration of CR-189..CR-194 on `fix/qa-13653ed`: `packages/ui`'s coverage fell under its floor (CR-193's `RIDE_DISCOVERY_TERMS.archiveShow` had no test) — added a plural test; `coverage-baseline.json` raised from a full live-stack run and now includes `packages/db` (CR-191's follow-up).
Contract: none (frontend + test config).
Files: `apps/web/src/features/organizer/{participants/components/ParticipantTable,rides/components/RideWorkspace}.tsx`, `apps/web/src/features/organizer/{participants/participants,rides/rides}.test.tsx`, `apps/web/src/stories/{RideWorkspaceSections.stories.tsx,ride-workspace-fixtures.ts}`, `apps/web/e2e/ride-lifecycle.spec.ts`, `apps/web/playwright.config.ts`, `apps/web/e2e/helpers/{api-fixtures,ui}.ts`, `packages/ui/src/terminology-discovery.test.ts`, `coverage-baseline.json`.
Validation (merged branch, disposable DB `coffee_ride_test_final`, live Redis + S3, no MapGL key): `pnpm install --frozen-lockfile`; `turbo lint typecheck --force` 17/17 with `NODE_PATH` unset; `pnpm test:coverage` — api 600, web 748, ui 246, maps-2gis 72 (+6 skipped), resilience 15, db 11, all passed; `pnpm coverage:check` holds; Storybook 175/175 with axe; e2e on 3199/4199: 44 passed, the 12 failures are only the missing macOS (`-darwin`) screenshot baselines (deleted, never committed) — Linux baselines see KI-084.
Decisions: none.
