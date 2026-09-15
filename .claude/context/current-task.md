# Current Task

## Status

complete

## Task ID

CR-030 — Stops

## Goal

`docs/tasks.md`'s Route section: next unchecked ticket after CR-029 ("Route
metadata"). `docs/database.md`: "Stop — named planned stop with location and
duration." A sixth domain table, distinct from `Route` (raw GPX polyline) and the
not-yet-built `RoutePoint` (CR-031, typed markers). `docs/api.md` already sketches
the endpoint shapes with no request/response bodies decided yet:

```
POST   /v1/rides/:id/stops
PATCH  /v1/rides/:id/stops/:stopId
DELETE /v1/rides/:id/stops/:stopId
```

`docs/design.md` §8: stops are managed on the existing `/organizer/rides/[id]/route`
screen (same screen as GPX upload — CR-027..029), not a new screen. §8/§9: the
participant-facing `/rides/[id]` shows a `StopList` (feature-local component).

## Scope decisions (this session, not ADR-level)

- **Fields**: `name` (required, ≤140 chars — same length as `Ride.title`), `description`
  (optional, ≤500 chars — same as `OrganizerProfile.description`), `lat`/`lng` (required,
  standard -90..90/-180..180 range — required, not nullable like `Ride.startLat/Lng`,
  because a stop's whole reason for existing is a location; `Ride`'s own coordinates are
  nullable because the ride itself is meaningful without them), `durationMinutes`
  (optional, ≥0 — how long the group plans to stay), `position` (server-assigned integer,
  not client-supplied — see below).
- **Ordering**: stops are shown in route order. `position` is assigned server-side on
  create (`current count for this ride`, i.e. appended at the end) and enforced unique
  per `(rideId, position)` at the DB level (`.claude/rules/database.md`: invariants at
  the DB level, not just app code) — protects against a duplicate-position race the same
  way other tables protect their own invariants. No reorder/drag support in this ticket
  (no design-doc UI for it) — a stop can only be added (goes last) or removed; `PATCH`
  edits a stop's own fields, never its position. If this turns out to matter, it's a
  follow-up, not silently done here.
- **Draft-only mutation**: same gate as every other ride-configuration endpoint
  (`PATCH /:id`, `POST/PATCH/DELETE .../route`) — reuses `resolveOwnDraftRide` verbatim,
  so `409 ride_not_editable` once the ride has left `draft`, same code, no new one.
  Consistent with the existing precedent rather than inventing a stops-specific status
  gate; flag as a known limitation if a real need to edit stops post-publish surfaces
  later (nothing in `docs/product.md` asks for it).
- **Read path**: no separate `GET .../stops` endpoint (matches `docs/api.md`'s sketch,
  which lists none) — `stops: Stop[]` becomes a new additive field on
  `GET /v1/rides/:id`'s response, ordered by `position`, same viewer-visibility rule as
  everything else in that response (owner always, others once left `draft`). Same
  precedent as `route: RouteSummary | null` (CR-027).
- **Error codes**: reuses `ride_not_found`/`ride_not_editable` (via `resolveOwnDraftRide`).
  One new code: `stop_not_found` (404) for `PATCH`/`DELETE` on a nonexistent or
  wrong-ride stop id — same resource-enumeration-safe shape as `ROUTE_NOT_FOUND`.

## Planned files

- `packages/db/src/schema/stop.ts` (new) + `schema/index.ts` export + migration.
- `packages/types/src/domain/stop.ts` (new `Stop` interface) + `src/index.ts` export.
- `packages/types/src/api/rides.ts`: `createStopRequestSchema`/`CreateStopRequest`,
  `updateStopRequestSchema`/`UpdateStopRequest`, extend `GetRideResponse` with
  `stops: Stop[]`.
- `apps/api/src/modules/rides/ride-response.schema.ts`: `stopResponseSchema`.
- `apps/api/src/modules/rides/rides.service.ts`: `toStop`, `STOP_NOT_FOUND`,
  `createStop`/`updateStop`/`deleteStop`, extend `getRideForViewer`.
- `apps/api/src/modules/rides/rides.routes.ts`: three new routes, extend
  `rideDetailResponseSchema`.
- `apps/api/src/modules/rides/rides.routes.test.ts`: happy path + auth/ownership +
  draft-only + validation + not-found for all three endpoints, plus the `GET /:id`
  additive-field assertion.
- `apps/web/src/features/organizer/route/`: stops management UI (add/edit/delete) on
  the existing route screen — `api.ts` additions, a `StopsSection` component.
- `apps/web/src/features/participant/ride-detail/`: `StopList` (feature-local per
  `docs/design.md` §9), rendered on `/rides/[id]`.
- `docs/api.md`, `docs/database.md`, `docs/tasks.md`, `docs/changelog.md`,
  `.claude/context/project-state.md`.

## Implementation progress

- [x] packages/db schema + migration (`0007_white_wong.sql`), applied to local
      `coffee_ride_dev`
- [x] packages/types
- [x] apps/api service + routes + response schema
- [x] apps/api tests (new `stops.routes.test.ts`, 14 tests)
- [x] apps/web organizer stops UI (`StopsSection`, wired into `RouteUploadForm`)
- [x] apps/web participant StopList (wired into `RideDetailView`)
- [x] apps/web tests (5 + 2 new)
- [x] docs updates (api.md, database.md, tasks.md, changelog.md)
- [x] full validation (lint/typecheck/build/test)
- [x] live verification (curl + browser-automation)
- [x] project-state.md update

## Validation results

`turbo run lint typecheck build test --force` — 25/25 tasks green across all 8
workspace members, against a real `DATABASE_URL=postgresql://glebchurkin@localhost:
5432/coffee_ride_dev`. `apps/api`: 174 tests (was 160, +14). `apps/web`: 116 tests
(was 109, +7). `pnpm format:check`/`lint:root` clean (one `prettier --write` pass on
9 new/touched files). Live-verified via curl: full stop lifecycle (create at
position 0/1, ordered `GET /v1/rides/:id`, validation 400, rename via `PATCH`,
`DELETE` 204, repeat `DELETE` 404 `stop_not_found`, `POST` on a published ride 409
`ride_not_editable`) cross-checked against a direct DB read. Live browser-verified
via the `browser-automation` skill against a real `next dev` server + `apps/api`:
added two stops through the form (screenshotted — Tailwind/`Card`/`Button` styling
all correct), edited one, deleted one, confirmed the participant `/rides/[id]` shows
the remaining stop under a numbered "Остановки" heading — 0 console errors. All
scratch test data (rides/organizer profiles/users) deleted from the DB afterward.

## Discovered issues

None. `known-issues.md` unaffected — no new gap, no existing one resolved.

## Final result

CR-030 ("Stops") complete: sixth domain table, three new endpoints, an additive
`stops` field on ride detail, organizer management UI, and participant display —
all live-verified end to end. `docs/tasks.md` checked off. Next: CR-031 ("Route
points").
