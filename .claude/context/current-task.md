# Current Task

## Status

complete

## Task ID

CR-031 — Route points

## Goal

`docs/tasks.md`'s Route section: the last remaining Route ticket, next after CR-030
("Stops"). `docs/database.md`: "RoutePoint — start/finish/stop/danger/water/food/
technical/other: a small set of organizer-placed _typed_ markers along the route —
distinct from `Route.geometry` (the raw GPX-derived polyline) and from `Stop` (named
planned stops with duration)." Seventh domain table. Unlike CR-030, `docs/api.md` has
no pre-sketched endpoint shapes for this one — designed in this session by close
analogy to the CR-030 precedent (same screen, same module, same draft-only gate).

## Scope decisions (this session, not ADR-level)

- **Fields**: `type` (required enum — `start`/`finish`/`stop`/`danger`/`water`/`food`/
  `technical`/`other`, `docs/database.md`'s own list), `label` (optional, ≤140 chars —
  a marker's own short name, since two markers can share a `type`, e.g. two `water`
  points on a long route), `description` (optional, ≤500 chars, same precedent as
  `Stop.description`), `lat`/`lng` (required, standard range, same reasoning as `Stop`:
  a marker's whole reason for existing is a location).
- **No `position`/ordering**: distinct from `Stop`. A `Stop` is an itinerary shown "in
  route order"; a `RoutePoint` is a typed pin meant to render on the map by `type`, not
  read as a sequence — nothing in `docs/design.md`/`docs/database.md` asks for manual
  ordering here. Display order is `createdAt asc` (stable, not meaningful).
- **No per-type uniqueness** (e.g. not forcing exactly one `start`): nothing in
  `docs/product.md`/`docs/database.md` mandates it, and a real route can reasonably
  have multiple `water`/`food` points. Not invented here.
- **Draft-only mutation**: identical gate to `Stop`/`Route` — reuses
  `resolveOwnDraftRide` verbatim, `409 ride_not_editable` once published.
- **Read path**: no separate `GET .../route-points` endpoint — additive
  `routePoints: RoutePoint[]` field on `GET /v1/rides/:id`, same embedding precedent as
  `route`/`stops`.
- **Error codes**: reuses `ride_not_found`/`ride_not_editable`. One new code:
  `route_point_not_found` (404), same resource-enumeration-safe shape as
  `stop_not_found`.
- **No participant-facing list component**: `docs/design.md` §8's ride-detail screen
  row names "route + profile, stops, services, requirements..." — no route-points list
  is named (unlike `Stop`, which explicitly got a `StopList`). Route points are marker
  pins meant for the map, and the map is already a documented degraded placeholder
  pending a live 2GIS credential (KI-031) — a textual duplicate of pin data isn't asked
  for anywhere. Ships as API + organizer management UI only; participant exposure
  follows naturally once real map rendering lands. Flagged as a forward note in
  `known-issues.md`, not a silent gap.

## Endpoints

```
POST   /v1/rides/:id/route-points
PATCH  /v1/rides/:id/route-points/:routePointId
DELETE /v1/rides/:id/route-points/:routePointId
```

## Planned files

- `packages/db/src/schema/route-point.ts` (new, `route_point_type` pg enum) +
  `schema/index.ts` export + migration.
- `packages/types/src/domain/route-point.ts` (new `ROUTE_POINT_TYPES`/`RoutePointType`/
  `RoutePoint`) + `src/index.ts` export.
- `packages/types/src/api/rides.ts`: `createRoutePointRequestSchema`/
  `CreateRoutePointRequest`, `updateRoutePointRequestSchema`/
  `UpdateRoutePointRequest`, extend `GetRideResponse` with `routePoints: RoutePoint[]`.
- `apps/api/src/modules/rides/ride-response.schema.ts`: `routePointResponseSchema`.
- `apps/api/src/modules/rides/rides.service.ts`: `toRoutePoint`,
  `ROUTE_POINT_NOT_FOUND`, `createRoutePoint`/`updateRoutePoint`/`deleteRoutePoint`,
  extend `getRideForViewer`.
- `apps/api/src/modules/rides/rides.routes.ts`: three new routes, extend
  `rideDetailResponseSchema`.
- `apps/api/src/modules/rides/route-points.routes.test.ts` (new): happy path +
  auth/ownership + draft-only + validation + not-found for all three endpoints, plus
  the `GET /:id` additive-field assertion.
- `apps/web/src/features/organizer/route/`: route-points management UI on the existing
  route screen — `api.ts` additions, a `RoutePointsSection` component.
- `packages/ui/src/terminology.ts`: `ROUTE_POINT_TERMS` + a `ROUTE_POINT_TYPE_TERMS`
  Russian label map (mirrors `BICYCLE_TYPE_TERMS`'s pattern).
- `docs/api.md`, `docs/database.md`, `docs/tasks.md`, `docs/changelog.md`,
  `.claude/context/project-state.md`, `.claude/context/known-issues.md` (forward note).

## Implementation progress

- [x] packages/db schema + migration (`0008_worthless_mesmero.sql`), applied to
      local `coffee_ride_dev`
- [x] packages/types
- [x] apps/api service + routes + response schema
- [x] apps/api tests (new `route-points.routes.test.ts`, 14 tests)
- [x] apps/web organizer route-points UI (`RoutePointsSection`, wired into
      `RouteUploadForm`)
- [x] apps/web tests (5 new + `routePoints` fixture updates across existing tests)
- [x] docs updates (api.md, database.md, tasks.md, changelog.md, known-issues.md
      +KI-036, architecture-map.md)
- [x] full validation (lint/typecheck/build/test)
- [x] live verification (curl + browser-automation)
- [x] project-state.md update

## Validation results

`turbo run lint typecheck build test --force` — 25/25 tasks green across all 8
workspace members, against a real `DATABASE_URL=postgresql://glebchurkin@localhost:
5432/coffee_ride_dev`. `apps/api`: 188 tests (was 174, +14). `apps/web`: 121 tests
(was 116, +5). `pnpm format:check`/`lint:root` clean (one `prettier --write` pass on
3 files). Live-verified via curl: full route-point lifecycle (create `start` +
`water` points, ordered `GET /v1/rides/:id`, invalid `type` → 400, `PATCH` `water`
→ `danger`, `DELETE` 204, repeat `DELETE` → 404 `route_point_not_found`, `POST` on
a published ride → 409 `ride_not_editable`) cross-checked against a direct DB read.
Live browser-verified via the `browser-automation` skill against a real `next dev`
server + `apps/api`: added a `danger`-type point with a label through the form
(screenshotted — Tailwind/`Card`/`Button` styling matches `StopsSection`), confirmed
the list entry, deleted it after confirming the browser dialog, confirmed the empty
state returned and the DB row was actually gone — 0 console errors. All scratch test
data (rides/organizer profiles/users) deleted from the DB afterward.

Note: two later re-runs of the full `turbo run lint typecheck build test --force`
(after the browser-automation session) failed with `vitest-pool-runner` worker
timeouts and cascading task cancellations — traced to this machine running several
concurrent Claude Code sessions plus a live Chrome browser with dozens of processes
(`ps aux`), not to this ticket's code: every affected package re-validated cleanly
run sequentially and standalone afterward (`types`/`db` build, `ui`/`api`/`web`
typecheck, `ui` 85, `api` 188, `web` 121 tests, `web` build, root lint, format:check
— all green). Environment/resource contention, not a regression.

## Discovered issues

None new. KI-036 opened deliberately (no participant-facing route-points UI yet —
see this file's own scope decision above), not a bug discovered mid-implementation.

## Final result

CR-031 ("Route points") complete: seventh domain table, three new endpoints, an
additive `routePoints` field on ride detail, and organizer management UI — all
live-verified end to end. `docs/tasks.md`'s Route section is now fully checked off.
Next: CR-032 ("Register"), the first Registration-section ticket.
