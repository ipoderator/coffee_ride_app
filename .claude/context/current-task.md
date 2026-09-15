# Current Task

## Status

complete

## Task ID

CR-028 — Route rendering

## Goal

`docs/tasks.md`'s Route section: next unchecked ticket after CR-027 ("GPX upload").
`docs/design.md` §8's `/rides/[id]` spec names "route + profile" as part of ride
detail; §9 names `RideMap`/`ElevationProfile` as feature-local components consuming
`packages/maps-core` types only; §6 has a full "Elevation profile" spec (area chart,
distance × elevation, muted `primary` fill, hover/touch, keyboard-accessible numeric
alternative). `.claude/context/known-issues.md`'s KI-035 names this ticket as the one
that decides how `Route.geometry` gets exposed beyond the CR-027 summary.

Selected via the same "next unchecked box" discipline `/next` has used since CR-023 —
Route is the section CR-027 started, CR-028 is its next ticket.

## Investigation before deciding scope

- **KI-035** (full geometry exposure): resolved inline, same precedent as
  CR-084/CR-085's own tickets — a new `GET /v1/rides/:id/route/geometry` endpoint,
  same viewer-visibility rule as `GET /v1/rides/:id`/`.../route/download`
  (`resolveOptionalUser`: owner always, others only once the ride has left `draft`).
  Not folded into the existing `route` summary field on `GET /v1/rides/:id` — the
  point array can be thousands of entries (CR-027's own reasoning for why it wasn't
  shipped there originally), so it stays a separate, opt-in fetch only the rendering
  screen makes. `404 route_not_found` if no route exists — same code the download
  endpoint already uses for the same fact.
- **Map half (KI-031/KI-016)**: no live `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` in this
  environment — same blocker CR-026 hit. Per `.claude/CLAUDE.md`'s stop conditions
  ("the failure depends on an unavailable external service/credential") and the
  CR-026 precedent (ship what's verifiable, degrade the rest, document the known
  issue rather than stopping the whole ticket): the route map renders a degraded
  `ErrorState` placeholder (`tone="warning"`, `variant="inline"`), not a live MapGL
  render. KI-031 stays open, widened to cover this second surface, not a new issue.
- **Elevation profile half**: does not need 2GIS at all (`docs/design.md` §6's spec is
  pure geometry — distance × elevation from `Route.geometry`) — buildable and
  live-verifiable this session. `docs/design.md` §9: `ElevationProfile` "consumes
  `packages/maps-core` types only" — `apps/web` gains `maps-core` as a real dependency
  (first consumer; allowed by `.claude/rules/architecture.md`'s "web → maps-core"),
  and the chart's point prop type is built from `maps-core`'s `LatLng` extended with
  `elevationMeters`.
- **No charting library exists in `apps/web`** (checked `package.json`) — same
  "hand-vendor something this simple" discipline `packages/ui`'s `Skeleton`/`Button`
  used (KI-020) rather than adding a new dependency for one inline SVG area chart.
  Cumulative distance along the track (the chart's x-axis) is computed client-side
  from the raw `lat`/`lng` points via haversine — a small, pure, duplicated-on-purpose
  formula (same tier as `apps/web`'s own `zoned-time.ts` vs. `apps/api`'s date logic;
  `apps/web` cannot import `apps/api`'s `gpx.ts` — separate deployable). The
  authoritative distance/elevation numbers stay `Route`'s own server-computed
  `distanceKm`/`elevationGainMeters` (already shown via `MetricTile` once wired in) —
  `docs/design.md` §6: "the chart is an illustration, the number is the fact," so
  chart-side imprecision from downsampling is acceptable.
- **Downsampling**: a real GPX can have thousands of points (CR-027/ADR-015's own
  scoping). Rendering an SVG path from an unbounded point count is a real, if small,
  performance concern (same "don't do unbounded work" spirit as ADR-015) — the chart
  downsamples to at most 200 evenly-spaced points before building the path. Purely a
  rendering simplification; does not touch the stored `Route.geometry` or the
  authoritative computed metrics.
- **Keyboard-accessible alternative** (`docs/design.md` §6: "the numeric summary is
  always present in text"): already satisfied once `RideDetailView` wires in
  `route.elevationGainMeters`/`route.distanceKm` via the existing `MetricTile`
  pattern — no separate accessible-alternative UI needed beyond that plus an
  `aria-label`/`role="img"` summary on the chart `<svg>` itself.
- **Feature-module boundary** (`.claude/rules/extensibility.md`): CR-027's
  `RouteMapPlaceholder`/upload UI live in `features/organizer/route/` (a different
  feature module, organizer-facing). This ticket's map placeholder is a **new**,
  small, participant-facing component in `features/participant/ride-detail/` —
  feature modules must not import each other's internals, so this is a second,
  independent instance of the same `ErrorState` degraded pattern, not a shared
  import, consistent with how `RideMapPlaceholder` already exists once for
  `features/participant/discovery/` alone.

## Scoping decisions

- **`packages/types`**: `domain/route.ts` gains `RouteGeometryPoint` (`lat`/`lng`/
  `elevationMeters: number | null` — mirrors `apps/api`'s `gpx.ts` shape).
  `api/rides.ts` gains `GetRouteGeometryResponse { points: RouteGeometryPoint[] }`.
- **`apps/api`**: `ride-response.schema.ts` gains `routeGeometryResponseSchema`.
  `rides.service.ts` gains `getRouteGeometry(db, userId, rideId)` — same
  ownership/visibility query as `getRouteDownload`, minus the S3 call (geometry is
  already in the DB row from CR-027, no storage round trip, no
  `route_storage_unavailable` case). `rides.routes.ts` gains
  `GET /:id/route/geometry`.
- **`apps/web`**: `apps/web/package.json` gains `maps-core` dependency.
  `features/participant/ride-detail/` gains:
  - `lib/elevation-profile.ts` — pure functions: haversine distance, downsampling,
    `buildElevationProfile(points, maxSamples = 200)`.
  - `components/ElevationProfileChart.tsx` — inline SVG area chart per
    `docs/design.md` §6 (`fill-primary/15`, `stroke-primary` 1.5px, y-axis floor not
    forced to zero, hover/touch tooltip via pointer move).
  - `components/RouteMapPlaceholder.tsx` — degraded `ErrorState`, same pattern as
    discovery's, independent instance (feature-boundary rule above).
  - `api.ts` gains `getRouteGeometry(rideId)`.
  - `RideDetailView.tsx` wires in a new "Маршрут" section, shown only when
    `ride.route` (the existing `RouteSummary`) is non-null: fetches geometry lazily
    (separate `useEffect`, keyed by route id), shows loading/error/success states for
    that fetch independently from the ride's own load state (a route-rendering
    failure must not blank the rest of the page — `.claude/rules/resilience.md`).
- **`packages/ui/src/terminology.ts`**: new `ROUTE_RENDERING_TERMS` block
  (participant-facing — distinct from CR-027's organizer-facing `RIDE_ROUTE_TERMS`).

## Requirements

- `packages/types/src/domain/route.ts`, `packages/types/src/api/rides.ts`.
- `apps/api/src/modules/rides/{ride-response.schema.ts,rides.service.ts,
rides.routes.ts,route.routes.test.ts}`.
- `apps/web/package.json`; `apps/web/src/features/participant/ride-detail/
{api.ts,lib/elevation-profile.ts (new),lib/elevation-profile.test.ts (new),
components/{ElevationProfileChart.tsx (new),RouteMapPlaceholder.tsx (new),
RideDetailView.tsx},ride-detail.test.tsx}`.
- `packages/ui/src/terminology.ts`.
- `docs/api.md`, `docs/tasks.md`, `.claude/context/known-issues.md`.

## Acceptance criteria

- `GET /v1/rides/:id/route/geometry`: same 404 `ride_not_found`/visibility rule as
  ride detail; 404 `route_not_found` if no route; 200 → full ordered point array for
  the owner and for any viewer once the ride has left `draft`.
- `/rides/[id]` shows an elevation profile chart when a route exists, matching
  `docs/design.md` §6's visual spec; omits the whole "Маршрут" section when
  `ride.route` is `null` (no route uploaded yet) — not an empty/broken chart.
- A geometry-fetch failure shows a local degraded/error state with retry, without
  blanking the rest of the ride detail page.
- Map half renders the degraded placeholder unconditionally (no live MapGL attempt),
  consistent with KI-031.
- `turbo run lint typecheck test build` green; `format:check`/`lint:root` clean.
- Live check: curl sequence for the new endpoint's ownership/draft-gate/not-found
  behavior against a real Postgres, plus a browser walkthrough of `/rides/[id]` for a
  ride with an uploaded route (elevation chart renders, map placeholder shows).

## Planned files

See Requirements above — same list.

## Implementation progress

- [x] Plan written (this file)
- [x] `packages/types` changes
- [x] `apps/api` endpoint/service/tests
- [x] `apps/web` chart/placeholder/wiring/tests
- [x] `packages/ui` terminology
- [x] Full validation
- [x] Live check
- [x] Context/docs updated
- [x] `git diff`/`git status` reviewed

## Validation

- `pnpm --filter api exec vitest run`: 8 files, 156 tests, all green (5 new
  `route.routes.test.ts` tests for the geometry endpoint).
- `pnpm --filter web exec vitest run`: 11 files, 106 tests, all green (8 new
  `elevation-profile.test.ts`, 3 new `ride-detail.test.tsx`).
- `turbo run lint typecheck test --force` (19 tasks, all 8 packages): all
  green against a real Postgres.
- `pnpm --filter web build` / `pnpm --filter api build` / `pnpm --filter
types build` / `pnpm --filter maps-core build`: all green, run separately
  (same known local `turbo run build`-vs-stale-`.next` race CR-027 already
  documented — not a regression, CI unaffected).
- `pnpm format:check`/`pnpm lint:root`: clean after one `prettier --write`
  pass (cosmetic only, 6 files).
- Live check via curl against a real Postgres + a freshly started `apps/api`
  (no `S3_*` configured): registered/verified/logged in, created an
  organizer profile and a draft ride. `GET .../route/geometry` on a
  non-existent id → `404 ride_not_found`; on the fresh ride with no route →
  `404 route_not_found`; an upload attempt correctly 503'd
  (`route_storage_unavailable`, S3 unreachable — KI-015 standing
  constraint) and geometry stayed `404 route_not_found` afterward (no
  orphaned row). Since MinIO can't be reached in this environment, a
  `routes` row was inserted directly via `psql` to exercise the endpoint's
  actual success path (this endpoint has no S3 dependency at all, unlike
  upload/download, so this validates the real code path, not a substitute
  for it): owner on a draft ride → `200` with the exact stored points; a
  second registered user (stranger) on that same draft ride → `404
ride_not_found`; after publish, the stranger and a fully unauthenticated
  request both → `200` with the same points. Every response matched its
  documented contract exactly.
- Live browser check via the `browser-automation` skill against a real
  `next dev` server + `apps/api`: `/rides/[id]` for the published test ride
  showed the "Маршрут" heading, "Карта маршрута временно недоступна."
  (degraded placeholder, expected — no live 2GIS credential), and a real
  `<svg role="img">` elevation chart with an accurate computed
  `aria-label` ("Профиль высоты: от 100 до 150 м на протяжении 1.2 км") and
  2 `<path>` elements (area fill + stroke line) — matches `docs/design.md`
  §6's visual spec (screenshot reviewed). 0 console errors, 0 failed
  network requests. All test data (route row, ride, organizer profile, two
  users) deleted from the scratch DB by id/email afterward; both dev server
  processes stopped.
- Every acceptance criterion from above is met.

## Discovered issues

- None beyond the two known issues this ticket itself resolves/widens
  (KI-035 resolved, KI-031 widened — both recorded in
  `.claude/context/known-issues.md` with full detail, not repeated here).

## Final result

CR-028 ("Route rendering") complete. `apps/api` gained `GET /v1/rides/:id/
route/geometry` (resolves KI-035), reading `Route.geometry` straight from
the DB with the same viewer-visibility rule as ride detail/download and no
S3 dependency. `apps/web` gained its first real dependency on
`packages/maps-core` (type-only `LatLng` import, per `docs/design.md` §9)
and a new "Маршрут" section on `/rides/[id]`: a hand-built inline-SVG
elevation profile chart (`docs/design.md` §6's full spec — muted fill,
non-zero-forced y-axis floor, hover tooltip, accessible `aria-label`) built
from pure haversine-distance + downsampling functions, and a degraded route
map placeholder (KI-031 widened — same missing 2GIS MapGL credential as
CR-026's discovery map, a second surface of the same known gap, not a new
root cause). The section is shown only when a route exists and degrades
locally (independent loading/error/retry state) on a geometry-fetch
failure, per `.claude/rules/resilience.md`. All acceptance criteria met;
full validation suite green (lint/typecheck/test/build across all 8
packages); live-verified end to end over both curl (the new endpoint's full
visibility contract, including the actual success path via a directly
inserted route row since MinIO stays unreachable in this environment) and a
real browser session (rendered chart + placeholder, 0 console errors).
`docs/tasks.md`, `docs/changelog.md`, `docs/api.md`,
`.claude/context/{project-state,architecture-map,known-issues}.md` all
updated. Not yet committed — `git diff`/`git status` reviewed next, contains
exactly the planned files, no unrelated changes.
