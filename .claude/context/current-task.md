# Current Task

## Status

complete

## Task ID

CR-026 — Map discovery

## Goal

`docs/tasks.md`'s Rides section: next unchecked ticket after CR-017..CR-025 (all
done — `docs/changelog.md`'s CR-025 entry explicitly names CR-026 as the follow-up).
`docs/design.md` §8: `/` "Discovery — **List + map toggle**; filters. Mobile default =
list"; §11: "Discovery becomes split list + map" at `lg`+. `docs/product.md` MVP item
4, "map/list discovery". `DiscoveryList.tsx`'s own doc comment already anticipated
this exact ticket ("the map toggle is CR-026").

Selected via `/next` over the alternative of jumping to the Route section — this is
still the literal next unchecked box, and picking it keeps `docs/tasks.md`'s stated
order and the prior session's own changelog follow-up note.

## Investigation before deciding scope

- **CR-084 dependency** (`docs/tasks.md`'s Contract & model follow-ups: "Decide the
  geo query approach for map discovery (bbox/radius): PostGIS vs built-in types +
  index strategy — needed by CR-026"), still unchecked. Resolved inline as part of
  this ticket's own scoping (same discipline CR-025 used for its own filter-dimension
  gap), not as a separate session — precedent: CR-062 ("Session store decision")
  was decided and implemented in the same session as CR-012, not beforehand. Decision
  recorded as **ADR-014** (see below) since it's a real, durable architectural choice
  per `.claude/rules/architecture.md`'s Change control section, not a scoping note.
  - Current `docker-compose.yml` Postgres is plain `postgres:17-alpine` — no PostGIS
    extension available without an image swap (a real infra change, ADR-worthy on its
    own, not justified by today's requirement).
  - `docs/product.md`'s MVP item 4 is "map/list discovery" — showing markers within
    the current map viewport (a bbox query). No named use case for true radius/
    great-circle proximity search ("rides within 10 km of me") or spatial joins
    against route polylines (`Route`/`RoutePoint` don't exist yet — CR-027..031).
  - Decision: plain `double precision` lat/lng columns + a bbox range query (`BETWEEN`
    on each axis), backed by a composite B-tree index. Defers PostGIS/`earthdistance`
    to when the product actually names radius search or clustering at scale — see
    ADR-014's "When to revisit".
- **Which point(s) get coordinates**: `docs/product.md`'s Ride fields list names
  "start, finish" directly on `Ride` (distinct from the future `Route` polyline). A
  discovery map only ever needs one pin per ride — where it begins. Decision: this
  ticket adds `startLat`/`startLng` only, not `finishLat`/`finishLng` — no named use
  case shows a finish pin on the discovery map, and a full route/stops screen is
  CR-027..031's scope. Recorded as a new known issue (finish-point geocoding remains
  unmodeled) rather than silently dropped.
- **How organizers set coordinates**: `packages/maps-2gis`'s geocode adapter exists
  (CR-007) but has no live-verified response shape (KI-016 — no `MAPS_2GIS_API_KEY`
  configured in this environment) and is not wired into any route yet. Building an
  address-to-coordinates UI on top of it now would be new, wholly unverifiable code
  (no mock can prove a live geocode call actually works against 2GIS's real API).
  Decision: this ticket adds plain manual lat/lng number inputs to the existing "Edit
  draft" form (CR-018) — the same "ride can still be created/viewed without geocoded
  coordinates" degraded path `.claude/rules/resilience.md` already names as the
  required fallback, just made the _only_ path for now instead of a fallback for when
  geocoding fails. Geocode-by-address is deferred to a new known issue, blocked on
  KI-016.
- **The map pane itself — real MapGL vs degraded state**: no `NEXT_PUBLIC_MAPS_2GIS_
MAPGL_KEY` is configured in this environment (`.env.example` only, verified: no
  matches for `NEXT_PUBLIC_MAPS_2GIS` anywhere under `apps/web/src`). A real 2GIS
  MapGL JS integration cannot be live-verified here — there is no mock for "does a
  vendor map tile actually render in a browser", unlike CR-007/CR-008's geocode
  adapter, which could be verified against documented/mocked HTTP response shapes.
  Per `.claude/CLAUDE.md`'s stop conditions ("the failure depends on an unavailable
  external service/credential") and `.claude/rules/resilience.md` ("the frontend must
  handle a degraded API response ... with a clear partial-failure UI state, not a
  blank screen"), this ticket ships the List/Map **toggle** and a real, fully
  live-verified **degraded state** for the map pane (reusing `ErrorState`'s existing
  `tone="warning"`/`variant="inline"` degraded pattern, CR-066) instead of writing an
  unverifiable live MapGL integration. The actual 2GIS MapGL rendering + marker
  wiring is deferred to a new known issue, explicitly blocked on KI-016 (no live
  credential), not attempted speculatively. `packages/maps-core`/`packages/maps-2gis`
  are NOT touched by this ticket.
- **Split list+map layout at `lg`+** (`docs/design.md` §11): the toggle behavior named
  in §8 ("List + map toggle") is implemented literally; the `lg`+ split-pane layout
  enhancement is left to CR-044 ("Responsive UI — audit against `docs/design.md`
  §11"), the ticket `docs/tasks.md` already designates for breakpoint-driven layout
  polish over screens already built — same precedent as every other screen shipping a
  correct-but-not-yet-breakpoint-polished baseline first.
- **Bbox query shape**: four named query params (`bboxNorth`/`bboxSouth`/`bboxEast`/
  `bboxWest`), matching the existing named-param convention (`bicycleType`, `limit`,
  `cursor`) rather than a single delimited string — consistent with `docs/api.md`'s
  existing style, still fully documented/typed instead of client-side-parsed
  (ADR-011's opaque-cursor precedent doesn't apply here, these are real filter
  values). All four required together (a `.refine` — a partial bbox is meaningless) or
  all omitted. Rides missing `startLat`/`startLng` are excluded when a bbox filter is
  active (can't place a pin) but remain visible in the plain (unfiltered) list —
  the resilience-required "ride can still be viewed without geocoded coordinates"
  behavior.

## Scoping decisions

- **DB — `packages/db`**: `rides` gains `startLat numeric(9,6)` / `startLng
numeric(9,6)` (nullable, `mode: 'number'` — same convention as `distanceKm`/`paceKmh`
  above), with CHECK constraints `-90 <= startLat <= 90` / `-180 <= startLng <= 180`
  (`.claude/rules/database.md`: invariants enforced at the DB level). New migration
  via `drizzle-kit generate`.
- **`packages/types`**: `Ride` gains `startLat: number | null`, `startLng: number |
null`. `updateRideRequestSchema` gains optional/nullable `startLat`/`startLng` with
  the same range validation, arriving together or not at all (same `.refine` pattern
  `startsAt`/`startTimezone` already uses). `listPublicRidesQuerySchema` gains
  optional `bboxNorth`/`bboxSouth`/`bboxEast`/`bboxWest` (`z.coerce.number()`, range-
  checked), all-or-nothing via `.refine`.
- **API — service**: `listPublicRides` adds bbox conditions (`gte`/`lte` on
  `startLat`/`startLng`, plus `isNotNull` on both) only when the bbox params are
  present; `updateRideDraft` persists `startLat`/`startLng` using the same
  per-field-`!== undefined` PATCH pattern every other nullable field already uses.
- **API — route**: `GET /v1/rides` querystring schema unchanged variable name, extra
  fields flow through automatically; no `preHandler` change.
- **Web — organizer**: `EditRideForm` gains two `Input type="number"` fields
  (`Широта`/`Долгота`) in the same draft-only-editable block as every other optional
  field, submitted/cleared via the existing `toNullableNumber` helper.
- **Web — participant discovery**: new `apps/web/src/features/participant/discovery/
components/{DiscoveryViewToggle.tsx, RideMapPlaceholder.tsx}`; `DiscoveryList` (or a
  thin wrapper) holds `view: 'list' | 'map'` state and renders the toggle in every
  status (same "always visible" precedent `RideFilters` set for CR-025). The map view
  renders `RideMapPlaceholder` — `ErrorState` with `tone="warning"` `variant="inline"`
  — explaining the map isn't available yet, never a blank pane.
- **New terminology**: `RIDE_DISCOVERY_TERMS` gains `viewListLabel`, `viewMapLabel`,
  `mapUnavailable`. `RIDE_EDIT_TERMS` gains `startLatLabel`, `startLngLabel`.
- **New ADR**: ADR-014 in `docs/decisions.md` (geo storage/query approach — see
  Investigation above).

## Requirements

- `docs/decisions.md`: append ADR-014.
- `packages/db/src/schema/ride.ts`: `startLat`/`startLng` columns + range CHECKs;
  generate + apply migration against the local dev DB
  (`postgresql://glebchurkin@localhost:5432/coffee_ride_dev`, confirmed reachable).
- `packages/types/src/domain/ride.ts`: `Ride.startLat`/`startLng`.
- `packages/types/src/api/rides.ts`: `updateRideRequestSchema` additions,
  `listPublicRidesQuerySchema` bbox additions.
- `apps/api/src/modules/rides/rides.service.ts`: `toPublicRide`, `updateRideDraft`,
  `listPublicRides` (bbox filter).
- `apps/api/src/modules/rides/rides.routes.test.ts`: bbox filter coverage (all-4-
  present, missing-param rejected, rides without coordinates excluded from a bbox
  query but present in the unfiltered list); `updateRideDraft` coordinate coverage.
- `apps/web/src/features/organizer/rides/components/EditRideForm.tsx`: two new
  fields; `apps/web/src/features/organizer/rides/rides.test.tsx`: coverage.
- `apps/web/src/features/participant/discovery/`: `DiscoveryViewToggle.tsx` (new),
  `RideMapPlaceholder.tsx` (new), `DiscoveryList.tsx` (extend), `discovery.test.tsx`
  (extend — toggle switches view, map view shows the degraded notice).
- `packages/ui/src/terminology.ts`: term additions above.
- `docs/api.md`: `GET /v1/rides` bbox params, `PATCH /v1/rides/:id` new fields.
- `.claude/context/known-issues.md`: resolve nothing (CR-084 wasn't its own KI); add
  new issues for (a) finish-point geocoding unmodeled, (b) no geocode-by-address UI
  (manual lat/lng only), (c) live 2GIS MapGL rendering not yet built — blocked on
  KI-016.
- `docs/tasks.md`: check off CR-026 and CR-084 (resolved together, same as CR-089/
  CR-020 or CR-090/CR-022 being checked off in the same session that implements them).

## Acceptance criteria

- ADR-014 accepted and recorded in `docs/decisions.md`.
- `packages/db`: migration applies cleanly against the local dev DB; CHECK constraints
  reject an out-of-range `startLat`/`startLng` at the DB level.
- `PATCH /v1/rides/:id` accepts/persists `startLat`/`startLng` (both together, or both
  `null` to clear); rejects a single one without the other the same way `startsAt`/
  `startTimezone` already do; rejects out-of-range values with `400 validation_error`.
- `GET /v1/rides`:
  - no bbox params: behavior unchanged (existing CR-024/CR-025 tests stay green).
  - all four bbox params: only rides whose `startLat`/`startLng` fall inside the box
    appear; a ride with no coordinates never appears in a bbox-filtered result.
  - a partial bbox (1-3 of the 4 params): `400 validation_error`.
- Web `/organizer/rides/[id]/edit`: two new number inputs, draft-only-editable,
  persist through save/reload like every other optional field.
- Web `/`: a List/Map toggle visible in every load state; selecting "Карта" shows a
  clear, non-blank degraded notice (`RIDE_DISCOVERY_TERMS.mapUnavailable`) instead of
  attempting to render a real map; selecting "Список" returns to the existing CR-024/
  CR-025 behavior unchanged. Verified in a real browser via `browser-automation`.
- `turbo run lint/typecheck/build/test` all green; `format:check`/`lint:root` clean.
- Live check: curl sequence covering the bbox/coordinate bullets above (cross-checked
  against a direct DB read) plus a real-browser walkthrough of the toggle.

## Planned files

- `docs/decisions.md`.
- `packages/db/src/schema/ride.ts` + generated migration.
- `packages/types/src/domain/ride.ts`, `packages/types/src/api/rides.ts`.
- `apps/api/src/modules/rides/{rides.service.ts,rides.routes.test.ts}`.
- `apps/web/src/features/organizer/rides/{components/EditRideForm.tsx,rides.test.tsx}`.
- `apps/web/src/features/participant/discovery/{components/{DiscoveryViewToggle.tsx (new),RideMapPlaceholder.tsx (new),DiscoveryList.tsx},discovery.test.tsx}`.
- `packages/ui/src/terminology.ts`.
- `docs/api.md`, `docs/tasks.md`, `.claude/context/known-issues.md`.

## Implementation progress

- [x] Plan written (this file)
- [x] ADR-014
- [x] `packages/db` schema + migration
- [x] `packages/types` changes
- [x] `apps/api` service/route/tests
- [x] `apps/web` organizer form changes
- [x] `apps/web` discovery toggle + degraded map state
- [x] `packages/ui` terminology
- [x] Full validation
- [x] Live check (curl + browser-automation)
- [x] Context/docs updated
- [x] `git diff`/`git status` reviewed

## Validation

- `turbo run lint typecheck build test` (25 tasks) against a real
  `DATABASE_URL=postgresql://glebchurkin@localhost:5432/coffee_ride_dev`:
  green. `apps/api`'s rides suite gained 6 tests (bbox filter incl.
  no-coordinates exclusion, partial-bbox rejection, coordinate persistence,
  paired-field rejection, out-of-range rejection) — 152 total, was 126.
  `apps/web` gained 2 tests (coordinate save, map-toggle degraded state) —
  87 total, was 85.
- `pnpm format:check`/`pnpm lint:root`: clean after one `prettier --write`
  pass (cosmetic only, two files).
- Live check via curl against a real Postgres + a freshly started
  `apps/api`: register → verify → login → create organizer profile, then
  three published rides (Moscow coords, Novosibirsk coords, no coords). A
  Moscow-area bbox returned only the Moscow ride (Novosibirsk and the
  coordinate-less ride both excluded); the unfiltered list still included
  all three. A partial bbox → `400 validation_error`; an unpaired or
  out-of-range coordinate PATCH → `400 validation_error` in both cases.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server + `apps/api` (both started fresh, stopped afterward): on
  `/`, clicking "Карта" replaced the list with the degraded notice ("Карта
  временно недоступна. Используйте список заездов.") and hid the list;
  clicking "Список" restored it — 0 console errors, 0 failed requests
  (two expected transient HMR-chunk aborts and one expected "no organizer
  profile yet" 404 probe, neither a bug). A full register → verify →
  organizer-profile → create-ride → edit-ride walkthrough confirmed
  "Широта старта"/"Долгота старта" save and persist exactly
  (`55.751244`/`37.618423` round-tripped through a full page reload).
  All test accounts/rides deleted from the scratch DB by id/email afterward
  (a blanket `DELETE FROM` was refused by the session's own safety
  classifier — scoped deletes used instead, same end state).
- Every acceptance criterion from above is met.

## Discovered issues

- Fastify's Zod response serializer (`ride-response.schema.ts`) strips any
  field not explicitly listed — the first PATCH test caught `startLat`/
  `startLng` silently disappearing from the response until the schema was
  extended. Not a design gap, just a step easy to forget; fixed immediately.
- New KI-031 (no live 2GIS MapGL render, blocked on KI-016), KI-032 (no
  geocode-by-address UI, blocked on KI-016), KI-033 (no finish-point
  coordinates, no named use case yet) — all recorded in
  `.claude/context/known-issues.md` with an explicit next action, not
  silently dropped.

## Final result

CR-026 ("Map discovery") and its prerequisite CR-084 (geo query approach)
both complete, decided/implemented together (ADR-014, same precedent as
ADR-013/CR-062). `rides` gained nullable `startLat`/`startLng`
(`numeric(9,6)`, range-CHECKed, composite-indexed — plain columns, not
PostGIS, per ADR-014's rationale: no PostGIS in the current Postgres image,
no named radius-search use case). `GET /v1/rides` gained an optional
map-viewport bbox filter; `PATCH /v1/rides/:id` accepts the new coordinate
fields (manual entry only, KI-016 blocks geocoding). `apps/web`'s `/` gained
a List/Map toggle; since no live 2GIS credential exists in this environment,
the map view is a real, live-verified degraded state rather than a
speculative, unverifiable live integration (`.claude/CLAUDE.md`'s stop
conditions on an unavailable external credential, applied deliberately, not
as a shortcut). `packages/maps-core`/`packages/maps-2gis` are unchanged.
All acceptance criteria met; full validation suite green (25/25 turbo tasks,
`apps/api` 152 tests, `apps/web` 87 tests); live-verified end to end over
both curl (bbox filtering, coordinate persistence, validation rejections)
and a real browser session (toggle behavior, degraded state, organizer
coordinate form). `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/{project-state,known-issues}.md`, `docs/api.md`,
`docs/decisions.md` all updated. Not yet committed — `git diff`/`git status`
reviewed, contains exactly the planned files, no unrelated changes.
