# Current Task

## Status

complete

## Task ID

CR-024 — Ride list (public discovery)

## Goal

`docs/tasks.md`'s Rides section: next unchecked ticket after CR-017/CR-088/
CR-016/CR-018/CR-019/CR-089/CR-020/CR-021/CR-090/CR-022/CR-023 (all done).
`docs/design.md` §8: `/` "Discovery — List + map toggle; filters. Mobile
default = list". `docs/api.md` already names this ticket explicitly: "GET
`/v1/rides` — collection, paginated — not yet implemented (CR-024, public
discovery: only `published`+ statuses, no auth)."

This ticket is the **list only** — no map toggle (CR-026 "Map discovery") and
no filter controls (CR-025 "Filters"), same "build the minimal real thing
now" discipline every prior CR used. It is also `/rides/[id]`'s (CR-023)
first real in-app entry point — closes KI-028's "no discovery screen links
here yet" half (the route/stops/services/requirements/registration half of
KI-028 stays open, unrelated to this ticket).

## Investigation before deciding scope

- **Visibility filter**: `docs/api.md`'s own phrase is "published+ statuses,
  no auth". CR-023 already established what "published+" means for the
  single-ride endpoint: any status except `draft` (`cancelled`/`finished`
  included — "not still a draft", not "never cancelled"). Reusing the exact
  same rule here for consistency (`.claude/CLAUDE.md`: no duplicate
  concepts/diverging rules for the same word). No viewer-dependent branch
  like `getRideForViewer`'s owner-sees-drafts-too case — this endpoint is
  fully public, no session is ever consulted (`docs/api.md` says "no auth"
  outright, and a discovery feed has no reason to show anyone's own drafts
  mixed into it).
- **Sort order**: `apps/api/src/lib/cursor.ts`'s own docstring already
  anticipated this endpoint reusing the `(createdAt, id)` cursor key
  ("every later [collection endpoint] ... including the public ride list ...
  reuses this same helper"). Considered ordering by `startsAt` instead
  (arguably more useful for a discovery feed — soonest-upcoming first), but:
  ascending `startsAt` would put old `finished`/`cancelled` rides (past
  timestamps) _before_ upcoming ones on page 1, which is actively wrong for
  a "find a ride to join" screen; descending is directionally better but
  still shows the furthest-future ride before the soonest one. Excluding
  past rides or sorting by proximity-to-now is a real filtering decision
  with no product-doc backing yet — that belongs to CR-025 ("Filters"), not
  invented here. Decision: reuse `createdAt desc, id desc` unchanged (same
  key as CR-088's `/mine`, zero new pagination code), and record the
  upcoming-first ordering gap as a new known issue rather than silently
  picking an order that isn't backed by any doc.
- **Response shape — organizer name**: `docs/product.md` Principle 2
  ("complete ride record, not a link out") and CR-023's precedent (`GET
/v1/rides/:id` embeds `organizer: { id, name }`) both argue for the same
  embed on each list item — a `RideCard` needs the organizer's name and
  there is still no separate public organizer-read endpoint (`docs/api.md`).
  Same join `getRideForViewer` already does, applied to the list query
  instead of a single row — no N+1, one query.
- **`packages/ui`'s `Pagination` component** (`docs/design.md` §9) doesn't
  exist yet, and CR-088's `/mine` list already established the precedent of
  fetching exactly one page with no "load more" control ("no product
  requirement for it this ticket; the underlying API is already
  cursor-paginated ... for when it does"). Reusing that same precedent here
  instead of building `Pagination` now — recorded as the same class of
  known gap CR-088 already normalized, not a new invention.
- **`GET /` vs `GET /rides`**: `ridesRoutes` is registered under the
  `/rides` prefix (`routes/v1.ts`), so the collection root is `app.get('/',
...)`, landing on `/v1/rides` exactly as `docs/api.md` already names it —
  no new prefix/route file needed. Route-matching order isn't a concern:
  Fastify's router (find-my-way) matches the literal empty-segment root
  ahead of the `/:id` param route regardless of registration order (already
  relied on implicitly today, since `/mine` — also literal — is registered
  before `/:id` and works correctly).

## Scoping decisions

- **API**: new `listPublicRides(db, query)` in `rides.service.ts` — same
  shape as `listOwnRides` (cursor pagination via `apps/api/src/lib/
cursor.ts`) but: `where status != 'draft'` (no organizer-ownership filter),
  joins `organizer_profiles` like `getRideForViewer`, maps each row through
  `toPublicRide` plus `{ organizer: { id, name } }`. No `emailVerified`/
  session check at all — the route has no `preHandler`.
- **Types**: `packages/types/src/api/rides.ts` gains `PublicRide` (`Ride &
{ organizer: RideOrganizerSummary }`) and `ListPublicRidesResponse`
  (`Paginated<PublicRide>`). Reuses the existing `listRidesQuerySchema` for
  the querystring — identical `limit`/`cursor` shape as `/mine`, no new
  fields.
- **API schema**: `ride-response.schema.ts` gains
  `rideWithOrganizerResponseSchema = rideResponseSchema.extend({ organizer:
rideOrganizerSummarySchema })`, reusing both existing pieces.
- **Route**: `app.get('/', { schema: { querystring: listRidesQuerySchema,
response: { 200: listPublicRidesResponseSchema } } }, ...)` — no
  `preHandler` (fully public). Placed right after `POST /` for grouping.
- **Web**: new feature module `apps/web/src/features/participant/
discovery/` (`.claude/rules/extensibility.md` shape: `components/`,
  `api.ts`) — `RideCard` is explicitly **feature-local** per `docs/
design.md` §9's component inventory ("Feature-local ... not shared"), not
  `packages/ui`. `DiscoveryList` fetches one page of `GET /v1/rides` (no
  session/cookie sent — matches "no auth"), renders `Skeleton`/`EmptyState`/
  `ErrorState`/success exactly like `RidesList`'s pattern, one `RideCard`
  per item linking to `/rides/[id]` (CR-023).
- **`RideCard` fields** (`docs/design.md` §6 "on a ride card, show the first
  three" metrics, canonical order дистанция → набор высоты → средний темп →
  длительность): title, `StatusBadge`, organizer name, a `MetricRow` with
  the first three of distance/elevation/pace/duration that are actually
  set (skipping `null`s, same "omit don't em-dash" rule CR-023's detail view
  established for a read-only public card), price. Cover image shown if set
  (always `null` today, KI-023, same as the detail view). No difficulty/
  bike-type row on the card (detail page shows "the full row plus difficulty
  and bike type" per §6 — the card is deliberately narrower).
- **`apps/web/src/app/page.tsx`**: replaces the CR-002 bootstrap placeholder
  with `<DiscoveryList />` inside a simple page wrapper — this _is_
  `docs/design.md`'s `/` Discovery screen (list-only slice of it).
- **New terminology**: `RIDE_DISCOVERY_TERMS` in `packages/ui/src/
terminology.ts` (page title, empty title/description, load error) —
  `.claude/rules/frontend.md`: no hard-coded Russian string in a component.
  Reuses `METRIC_TERMS`/format `*Parts` helpers already built for CR-023.

## Requirements

- `apps/api/src/modules/rides/rides.service.ts`: `listPublicRides`.
- `apps/api/src/modules/rides/rides.routes.ts`: `GET /` + response schema.
- `apps/api/src/modules/rides/ride-response.schema.ts`:
  `rideWithOrganizerResponseSchema`.
- `packages/types/src/api/rides.ts`: `PublicRide`, `ListPublicRidesResponse`.
- `apps/api/src/modules/rides/rides.routes.test.ts`: new `GET /v1/rides`
  describe block.
- `apps/web/src/features/participant/discovery/{api.ts,
components/{RideCard.tsx,DiscoveryList.tsx},discovery.test.tsx}` (new).
- `apps/web/src/app/page.tsx` (replace placeholder), `apps/web/src/app/
page.test.tsx` (replace bootstrap smoke test with a real one).
- `packages/ui/src/terminology.ts`: `RIDE_DISCOVERY_TERMS`.
- `docs/api.md`: flip the `GET /v1/rides` entry from "not yet implemented"
  to implemented, document shape/ordering/no-auth.
- `.claude/context/known-issues.md`: close KI-028's "no discovery entry
  point" half (route/stops/services/requirements/registration stays open);
  new known issue for "discovery isn't ordered by upcoming-soonest, and past
  finished/cancelled rides aren't segregated" — deferred to CR-025.
- `docs/tasks.md`: check off CR-024.

## Acceptance criteria

- `GET /v1/rides` (no auth, ever):
  - no rides at all → `200 { items: [], nextCursor: null }`.
  - a `draft` ride never appears, regardless of whose it is.
  - `published`/`registration_open`/`registration_closed`/`started`/
    `finished`/`cancelled` rides all appear.
  - each item carries `organizer: { id, name }`, cross-checked against a
    direct DB read.
  - pagination: `limit` + `cursor` behave like `/mine` (newest-`createdAt`
    first, a second page reachable, a malformed cursor → `400
invalid_cursor`).
- Web `/` (Discovery): loading skeleton → real published ride(s) render as
  cards (title, status, organizer, up to three metrics, price), each linking
  to its own `/rides/[id]`; zero rides → `EmptyState`, not a blank page;
  network error → `ErrorState`. Verified unauthenticated, in a real browser.
- `turbo run lint/typecheck/build/test` all green; `format:check`/
  `lint:root` clean.
- Live check: curl sequence covering every bullet above (cross-checked
  against a direct DB read) plus a real-browser walkthrough via
  `browser-automation`.

## Planned files

- `apps/api/src/modules/rides/{rides.service.ts, rides.routes.ts,
ride-response.schema.ts, rides.routes.test.ts}` (extend).
- `packages/types/src/api/rides.ts` (extend).
- `packages/ui/src/terminology.ts` (extend).
- `apps/web/src/features/participant/discovery/{api.ts,
components/{RideCard.tsx,DiscoveryList.tsx}}` (new).
- `apps/web/src/app/page.tsx`, `apps/web/src/app/page.test.tsx` (replace).
- `docs/api.md`, `docs/tasks.md`, `.claude/context/known-issues.md`.

## Implementation progress

- [x] Plan written (this file)
- [x] `apps/api` changes (service, routes, response schema, types) + tests
- [x] `packages/ui` terminology addition
- [x] `apps/web` feature module + page
- [x] Full validation
- [x] Live check (curl + browser-automation)
- [x] Context/docs updated
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run lint typecheck build test` (25 tasks) against a real
  `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`
  (Docker Desktop still unavailable): green. `apps/api` gained a new `GET
/v1/rides (public discovery, CR-024)` block (4 tests: empty collection,
  draft excluded, every non-draft status with organizer cross-checked
  against the DB, pagination + malformed cursor) — 120 total, was 116.
  `apps/web` gained `discovery.test.tsx` (4 tests: error state, empty
  state, full render with organizer/first-three metrics/price, a null
  metric omitted) and lost the removed CR-002 bootstrap smoke test (1 test)
  — 81 total, was 78.
- `pnpm format:check`/`pnpm lint:root`: clean after one `prettier --write`
  pass (cosmetic only — this file, the two `rides.*` API files, the new
  discovery feature files, `terminology.ts`).
- Live check via curl against a real Postgres + a freshly started `apps/api`
  (`tsx watch src/server.ts`, confirmed healthy via `/health` first):
  register → verify → login → create organizer profile, then: (1) `GET
/v1/rides` with nothing yet → `{ items: [], nextCursor: null }`; (2)
  created a draft ride, a published ride (fully filled in via `PATCH` then
  `publish`), and a cancelled ride (`publish` then `cancel`); (3) `GET
/v1/rides?limit=50` with no cookie at all → the draft never appeared, the
  published and cancelled rides both did, each `organizer` cross-checked
  against a direct DB read of `organizer_profiles`; (4) a malformed cursor
  → `400 invalid_cursor`; (5) `limit=1` pagination followed across a real
  second page via `nextCursor`.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server (started fresh, stopped afterward) + the already-running
  `apps/api`: navigated to `/` with no login at all — rendered "Заезды"
  heading, a card for the cancelled ride and a card for the published ride
  (title/status badge/"Организатор: CR-024 клуб"/start date-time/distance
  42,3 км/elevation 350 м/pace 24,5 км/ч/price 500 ₽), the draft ride never
  appeared anywhere on the page. Clicked the published card's link:
  navigated to `/rides/[id]` and rendered the full detail correctly
  (title, organizer, metrics). 0 console errors, 0 failed requests.
  Test account/rides deleted from the scratch DB afterward.
- Every acceptance criterion from above is met.

## Discovered issues

None found during implementation — no bugs hit, no workarounds needed.
New known issue opened: KI-029 (discovery list sorts `createdAt desc`, not
by upcoming-soonest — deferred to CR-025). KI-028 narrowed (the "no
discovery entry point" half is resolved; the route/stops/services/
requirements/registration half stays open, unrelated to this ticket).

## Final result

CR-024 ("Ride list", public discovery) complete. `GET /v1/rides`
(`apps/api/src/modules/rides`) is now the collection root under the
existing `ridesRoutes` prefix — fully public, no session ever consulted,
returning every ride that has left `draft` (same "published+" rule CR-023
established), each item carrying its organizer's public `{ id, name }`.
Reuses CR-088's cursor-pagination machinery and sort key unchanged. `apps/web`
gained its second fully public feature module,
`features/participant/discovery/`, and `/` now renders it in place of the
CR-002 bootstrap placeholder — `docs/design.md`'s Discovery screen's
list-only slice (map toggle is CR-026, filters are CR-025). `RideCard` is
feature-local per `docs/design.md` §9, not `packages/ui`. All acceptance
criteria met; full validation suite green (25/25 turbo tasks, `apps/api`
120 tests, `apps/web` 81 tests); live-verified end to end over both curl
(every status/organizer/pagination case, cross-checked against a direct DB
read) and a real browser session (an unauthenticated viewer browsing the
discovery list and clicking through into a ride's detail page). `docs/
tasks.md`, `docs/changelog.md`, `.claude/context/{project-state,
known-issues}.md` all updated, including new KI-029 and KI-028's
narrowing. Not yet committed — `git diff`/`git status` reviewed, contains
exactly the planned files, no unrelated changes.
