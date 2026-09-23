# Current task

## CR-114 — Route builder on 2GIS roads (organizer)

Goal: an organizer builds a ride's route by placing waypoints on the map; the
API routes them through 2GIS Routing (bicycle) so the line only follows roads
2GIS knows — never a straight segment across a river/relief. User chose this
over GPX map-matching (2026-09-23). GPX upload stays as an alternative.

Requirements:

- `POST /v1/rides/:id/route/build` `{ points: LatLng[] (2..25) }`, owner +
  draft only, creates or replaces the ride's route.
- Adapter never falls back to straight lines between waypoints: no geometry
  from 2GIS → a "no route" error, not the waypoints.
- Degraded: no key / 2GIS down → 503 `route_builder_unavailable`; 2GIS found
  no route → 422 `route_not_buildable`.
- The built route is stored like an uploaded one (GPX generated from the 2GIS
  geometry, same metrics computation, same ride auto-fill rule).
- Web: map on `/organizer/rides/[id]/route`, click to add points, remove /
  clear, build, see the result.

Acceptance: API + adapter + web tests; typecheck/lint/build; live-verified
against real 2GIS once the VPN is off (KI-056).

Planned files: packages/maps-core (types, render onClick), packages/maps-2gis
(route.ts, errors.ts, render.ts), apps/api (plugins/maps.ts, service,
routes, eslint, build.mjs, package.json), packages/types (request schema),
apps/web features/organizer/route (RouteBuilder, api.ts), packages/ui terms,
docs (api.md, changelog, tasks, maps.md, architecture-map).

Progress: implemented — adapter, API endpoint, web builder, docs.
Validation: typecheck + lint clean (maps-core, maps-2gis, types, ui, web, api);
tests maps-2gis 24, ui 121, web 242, api 384 (+3 skipped); web + api builds
pass. Browser: clicks add points, build shows the degraded 503 message.
Blocker: live 2GIS verification — REST APIs unreachable via VPN (KI-056).
Discovered: `getRoute` silently returned the raw waypoints when 2GIS geometry
failed to parse — i.e. straight lines. Fixed as part of this task.
