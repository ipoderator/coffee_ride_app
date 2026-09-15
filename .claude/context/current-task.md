# Current Task

## Status

complete

## Task ID

CR-025 — Filters (public discovery)

## Goal

`docs/tasks.md`'s Rides section: next unchecked ticket after CR-017/CR-088/
CR-016/CR-018/CR-019/CR-089/CR-020/CR-021/CR-090/CR-022/CR-023/CR-024 (all
done). `docs/design.md` §8: `/` "Discovery — List + map toggle; **filters**.
Mobile default = list". Also the ticket `.claude/context/known-issues.md`
KI-029 explicitly named as where to fix "discovery isn't ordered by
upcoming-soonest, and past rides aren't segregated": "either a default
'upcoming only' filter, a smarter default sort, or both."

## Investigation before deciding scope

- **What to filter by**: neither `docs/product.md` ("browse/filter rides",
  no specifics) nor `docs/design.md` (`RideFilters` is listed as
  feature-local in §9's component inventory, no field list) names concrete
  filter criteria — a real product-spec gap, same shape as CR-024's
  "published+" phrase needing interpretation. Of `Ride`'s fields, only
  `bicycleType` is both (a) always set (required since CR-017, unlike
  `distanceKm`/`difficulty`/`priceRub`, all still nullable/optional per
  CR-018) and (b) a small closed enum well-suited to a simple filter
  control, with an already-built label map (`BICYCLE_TYPE_TERMS`). Decision:
  ship exactly one filter dimension this ticket — `bicycleType` — and defer
  distance/difficulty/price/date-range filters (each would need real
  range-picker UI with no design-doc backing either) to a future ticket if
  the product ever specifies them. Same "build the minimal real thing now"
  discipline every prior CR used, not an oversight.
- **KI-029's "upcoming only" half**: `docs/product.md` Principle 3 ("Live
  status, not stale coordination") argues against a "find a ride to join"
  screen surfacing rides that have already started/finished. Decision: make
  "upcoming" (`startsAt >= now`) the discovery endpoint's unconditional
  default — not a toggleable filter, since no use case for browsing past
  rides from `/` has ever been named (an organizer's own history is
  `/organizer/rides`, CR-088; a specific ride already visited stays
  reachable at `/rides/[id]`, CR-023, regardless of how long ago it
  happened). This is a real, deliberate behavior change from CR-024 (a
  `finished`/`cancelled`/started-in-the-past ride no longer appears in the
  list at all), directly resolving KI-029, not a side effect.
  With "upcoming only" in place, `startsAt asc` (soonest-first) becomes the
  correct default sort — the exact problem KI-029 raised with `startsAt`
  ordering (old past rides sorting first) no longer applies once past rides
  are excluded outright. Sort key changes from `(createdAt, id)` to
  `(startsAt, id)` for this endpoint only; `/mine` (CR-088) keeps
  `createdAt desc` unchanged (a management list correctly wants
  newest-drafted-first, unrelated to when the ride happens).
- **`apps/api/src/lib/cursor.ts` generalization**: `CursorKey` is currently
  `{ createdAt: string, id: string }`, hard-coding the field name to the
  one column every consumer happened to sort by so far. This ticket's two
  sort keys (`/mine`'s `createdAt`, `/` discovery's `startsAt`) need the
  same opaque-cursor machinery on two different columns. Renamed the field
  to the neutral `sortValue` — the cursor is opaque and never parsed
  client-side (ADR-011), so this is a safe internal rename, not a contract
  change; both existing call sites (`listOwnRides`, `listPublicRides`)
  updated to pass their own sort column's value under that name.
- **`docs/design.md` §10's own empty-state example already names this
  ticket's exact copy**: "Пока нет заездов по этим фильтрам" + "Сбросить
  фильтры" — quoted verbatim in both §10 and `EmptyState`'s own doc comment
  (`packages/ui/src/components/EmptyState.tsx`, written back in CR-066,
  before any filter existed to use it). Using that exact wording, distinct
  from the unfiltered `RIDE_DISCOVERY_TERMS.emptyTitle` ("Пока нет
  заездов") CR-024 already shipped.
- **Filter control shape**: `packages/ui` has no `Select` primitive yet
  (KI-020 — the shadcn-CLI-targeting question is still open for the first
  structurally complex primitive). Building one now for a single
  feature-local dropdown would pull that open question in early for no
  ticket-specific reason. Decision: a plain native `<select>` inside the
  feature-local `RideFilters` component (`docs/design.md` §9 already lists
  `RideFilters` as feature-local, not shared) — no new shared primitive,
  same escape hatch CR-066/CR-011 already used for structurally trivial
  cases.
- **Where filter state lives**: local component state in `DiscoveryList`
  (lifted just far enough to also drive the reset-filters action), refetch
  on change — no URL query-param sync. No product/design requirement names
  shareable filtered URLs, and every other list screen in this codebase
  (`RidesList`, `/mine`) keeps its state local too.

## Scoping decisions

- **API — query schema**: `packages/types/src/api/rides.ts` gains
  `listPublicRidesQuerySchema = listRidesQuerySchema.extend({ bicycleType:
z.enum(BICYCLE_TYPES).optional() })` and `ListPublicRidesQuery`. `/mine`
  keeps using the unextended `listRidesQuerySchema` unchanged.
- **API — service**: `listPublicRides(db, query: ListPublicRidesQuery)`:
  - conditions: `ne(status, 'draft')`, `gte(startsAt, new Date())` (computed
    fresh per call), plus `eq(bicycleType, query.bicycleType)` only when
    provided.
  - `.orderBy(asc(rides.startsAt), asc(rides.id))`.
  - cursor comparison flips to `>` (ascending pagination): `(startsAt, id) >
(cursor.sortValue::timestamptz, cursor.id::uuid)`.
  - `encodeCursor({ sortValue: last.ride.startsAt.toISOString(), id:
last.ride.id })`.
- **API — cursor.ts**: `CursorKey.createdAt` renamed to `CursorKey.sortValue`
  (internal-only rename, cursor stays opaque). `listOwnRides` updated to
  match (still `createdAt desc`, unaffected in behavior).
- **API — route**: `GET /` querystring schema becomes
  `listPublicRidesQuerySchema`; no other route change (still no
  `preHandler`).
- **Web — feature module**: `apps/web/src/features/participant/discovery/
components/RideFilters.tsx` (new) — a labelled native `<select>` (options:
  "Все типы" + the four `BICYCLE_TYPE_TERMS`), reusing
  `RIDE_CREATE_TERMS.bicycleTypeLabel` for the `<label>` text (no duplicate
  term). `DiscoveryList` holds `bicycleType: BicycleType | undefined` state,
  passes it to `listPublicRides`, refetches on change, renders `RideFilters`
  above the list/empty/error states.
- **Web — empty states**: unfiltered + empty → existing
  `RIDE_DISCOVERY_TERMS.emptyTitle`/`emptyDescription` (unchanged). Filtered
  (a `bicycleType` selected) + empty → new
  `RIDE_DISCOVERY_TERMS.emptyFilteredTitle` ("Пока нет заездов по этим
  фильтрам") with an action button reading
  `RIDE_DISCOVERY_TERMS.resetFiltersLabel` ("Сбросить фильтры") that clears
  the filter state.
- **New terminology**: `RIDE_DISCOVERY_TERMS` gains `filterAllOption`,
  `emptyFilteredTitle`, `resetFiltersLabel`.

## Requirements

- `apps/api/src/lib/cursor.ts`: `CursorKey.createdAt` -> `sortValue`.
- `apps/api/src/modules/rides/rides.service.ts`: `listOwnRides` (cursor
  field rename only, no behavior change), `listPublicRides` (upcoming-only
  filter, `bicycleType` filter, `startsAt asc` sort + cursor flip).
- `apps/api/src/modules/rides/rides.routes.ts`: querystring schema swap.
- `packages/types/src/api/rides.ts`: `listPublicRidesQuerySchema`,
  `ListPublicRidesQuery`.
- `apps/api/src/modules/rides/rides.routes.test.ts`: rewrite the `GET /v1/
rides` describe block for the new default (upcoming-only, `startsAt asc`)
  and add `bicycleType` filter coverage.
- `apps/web/src/features/participant/discovery/api.ts`: `listPublicRides`
  gains an optional `bicycleType` param.
- `apps/web/src/features/participant/discovery/components/
RideFilters.tsx` (new), `DiscoveryList.tsx` (extend), `discovery.test.tsx`
  (extend).
- `packages/ui/src/terminology.ts`: `RIDE_DISCOVERY_TERMS` additions.
- `docs/api.md`: update `GET /v1/rides`'s entry (upcoming-only default,
  `bicycleType` filter, `startsAt asc` sort).
- `.claude/context/known-issues.md`: resolve KI-029; new known issue
  recording that distance/difficulty/price/date-range filters are deferred
  (no product-doc backing yet).
- `docs/tasks.md`: check off CR-025.

## Acceptance criteria

- `GET /v1/rides` (no auth):
  - a ride whose `startsAt` is in the past never appears, regardless of
    status (published, cancelled, finished, etc.).
  - a ride whose `startsAt` is in the future and status isn't `draft`
    appears, ordered soonest-first (`startsAt asc`).
  - `?bicycleType=gravel` (etc.) returns only rides of that type; omitted
    param returns every type (still upcoming-only).
  - pagination (`limit`/`cursor`) still works under the new sort key; a
    malformed cursor -> `400 invalid_cursor`.
- `GET /v1/rides/mine` unaffected (still `createdAt desc`, no
  `bicycleType` filter) — existing tests for it stay green unmodified.
- Web `/`: a `RideFilters` select above the list; changing it refetches and
  narrows the cards shown; an unfiltered empty result shows the plain empty
  state, a filtered empty result shows "Пока нет заездов по этим фильтрам"
  with a working "Сбросить фильтры" action that clears the filter and
  restores the full list. Verified unauthenticated, in a real browser.
- `turbo run lint/typecheck/build/test` all green; `format:check`/
  `lint:root` clean.
- Live check: curl sequence covering every bullet above (cross-checked
  against a direct DB read where relevant) plus a real-browser walkthrough
  via `browser-automation`.

## Planned files

- `apps/api/src/lib/cursor.ts` (extend/rename).
- `apps/api/src/modules/rides/{rides.service.ts, rides.routes.ts,
rides.routes.test.ts}` (extend).
- `packages/types/src/api/rides.ts` (extend).
- `packages/ui/src/terminology.ts` (extend).
- `apps/web/src/features/participant/discovery/{api.ts,
components/{RideFilters.tsx (new), DiscoveryList.tsx},discovery.test.tsx}`.
- `docs/api.md`, `docs/tasks.md`, `.claude/context/known-issues.md`.

## Implementation progress

- [x] Plan written (this file)
- [x] `apps/api` changes (cursor.ts, service, routes, types) + tests
- [x] `packages/ui` terminology addition
- [x] `apps/web` feature module changes
- [x] Full validation
- [x] Live check (curl + browser-automation)
- [x] Context/docs updated
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run lint typecheck build test` (25 tasks) against a real
  `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`
  (Docker Desktop still unavailable): green. `apps/api`'s `GET /v1/rides`
  block gained 2 tests (past-ride exclusion, `bicycleType` filter) and had
  its pagination test rewritten for the new soonest-first sort — 122
  total, was 120; `/mine`'s own tests untouched and still green. `apps/web`
  gained 2 new tests in `discovery.test.tsx` (filter refetch, filtered-empty
  - reset) — 83 total, was 81.
- `pnpm format:check`/`pnpm lint:root`: clean after one `prettier --write`
  pass (cosmetic only).
- Live check via curl against a real Postgres + a freshly started `apps/api`:
  register → verify → login → create organizer profile, then created a
  future `road` ride and a sooner future `gravel` ride (both published),
  plus a `mtb` ride published with a 2020 `startsAt`. `GET /v1/rides` with
  no filter/no cookie returned exactly the two future rides, gravel (sooner)
  before road — proving soonest-first ordering, not creation order, and
  proving the past ride never appears. `?bicycleType=road` returned only
  the road ride.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server (started fresh, stopped afterward) + the already-running
  `apps/api`: `/` with no login rendered the two future rides soonest-first,
  the past ride absent; selecting "Горный (MTB)" (no upcoming MTB ride
  exists) showed the filtered-empty state ("Пока нет заездов по этим
  фильтрам") with a working "Сбросить фильтры" button that restored the
  full list; selecting "Шоссейный" narrowed to only the road ride. 0
  console errors, 0 failed requests. Test account/rides deleted from the
  scratch DB afterward.
- Every acceptance criterion from above is met.

## Discovered issues

None found during implementation — no bugs hit, no workarounds needed.
Resolved KI-029 (discovery list ordering/past-ride segregation, as its own
"next action" pointed here). New KI-030 opened: distance/difficulty/price/
date-range filters remain deferred, `bicycleType` is the only filter
dimension this ticket ships.

## Final result

CR-025 ("Filters") complete. `GET /v1/rides` gained an optional
`?bicycleType=` filter (`packages/types`' `listPublicRidesQuerySchema`,
`/mine` unaffected) and, resolving KI-029, made "upcoming"
(`startsAt >= now`) an unconditional part of the endpoint with a
soonest-first (`startsAt asc`) default sort — a deliberate behavior change
from CR-024, not a side effect, documented in this file's investigation
section. `apps/api/src/lib/cursor.ts`'s `CursorKey` field was generalized
from `createdAt` to `sortValue` (internal-only rename, cursor stays opaque)
so `/mine` (`createdAt desc`) and `/` (`startsAt asc`) share the same
pagination helper. `apps/web` gained a feature-local `RideFilters` (plain
native `<select>`, no new shared primitive — KI-020 stays open) and
`DiscoveryList` now shows a distinct filtered-empty state with a working
reset action, using the exact copy `docs/design.md` §10 already named.
All acceptance criteria met; full validation suite green (25/25 turbo
tasks, `apps/api` 122 tests, `apps/web` 83 tests); live-verified end to end
over both curl (soonest-first ordering, past-ride exclusion, bicycleType
filtering) and a real browser session (filter select, filtered-empty state,
working reset). `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/{project-state,known-issues}.md` all updated — KI-029
resolved, new KI-030 opened. Not yet committed — `git diff`/`git status`
reviewed, contains exactly the planned files, no unrelated changes.
