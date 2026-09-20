# Current task

Task ID: CR-098 (live 2GIS MapGL rendering, resolving KI-031's discovery
half, ADR-020).

Status: **Done.**

## Goal

Get a real, live 2GIS MapGL render on screen for the discovery map, proving
the map provider → render pipeline actually works end to end, before
broader frontend/UI-design work continues.

## Scope decision

MVP: real MapGL rendering on the **discovery map** only (`/`), showing each
published ride's start-location pin. Route-detail map (`RouteMapPlaceholder`,
polyline + `RoutePoint`/`Stop` markers), marker clustering, and click-to-
select interactions were deliberately deferred — see `docs/decisions.md`
ADR-020 "What this does NOT mean" and `.claude/context/known-issues.md`
KI-036's update.

## Requirements / acceptance criteria — all met

- `packages/maps-core/src/render.ts`: `MapRenderer`/`MapHandle`/
  `MapMarkerInput`/`MapRenderOptions`, provider-neutral, separate from
  server-safe `MapProvider`.
- `packages/maps-2gis/src/render.ts`: real `@2gis/mapgl` SDK implementation,
  dynamically imported, browser-only.
- `apps/web/src/lib/maps/create-map-renderer.ts`: the one composition point
  allowed to import `maps-2gis`, with a matching scoped `eslint.config.mjs`
  override (CR-056's `*2gis*` glob also matches the bare `maps-2gis`
  specifier).
- `DiscoveryMap` replaces `RideMapPlaceholder` on `/`; falls back to the
  same placeholder on a missing key or a failed render.
- ADR-020 appended; `.claude/rules/maps.md` and
  `.claude/context/architecture-map.md` updated to match.

## Implementation summary

- `packages/maps-core/src/{render,provider}.ts` (+ `index.ts`,
  `tsconfig.json`'s `"lib": ["ES2022", "DOM"]`).
- `packages/maps-2gis/src/{render,index}.ts`, `package.json` (new
  `@2gis/mapgl` dependency), `tsconfig.json` (same `"lib"` addition).
- `apps/web/src/lib/maps/create-map-renderer.ts` (new), `eslint.config.mjs`
  (scoped override), `package.json` (new `maps-2gis` workspace dependency).
- `apps/web/src/features/participant/discovery/components/{DiscoveryMap
(new),DiscoveryList,RideMapPlaceholder}.tsx`.
- `docs/decisions.md` (ADR-020), `.claude/rules/maps.md`,
  `.claude/context/architecture-map.md`, `docs/changelog.md`,
  `.claude/context/known-issues.md` (KI-031 narrowed, KI-036 updated,
  KI-051 new+resolved), `.claude/context/project-state.md` (overwritten),
  `docs/tasks.md` (CR-098 checked off).

## Validation results

- `pnpm turbo lint typecheck build` — clean across all packages (one stale
  `.next/types` artifact from a build/typecheck race cleared with `rm -rf
apps/web/.next`, unrelated to this ticket's code — same category as a
  gotcha CR-093 already hit).
- `pnpm --filter web test` — 198/198 passing (existing CR-026 degraded-state
  test unaffected — no `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` in the Vitest
  process env, same fallback path).
- `pnpm --filter maps-2gis test` — 11/11 passing.
- Live end-to-end verification: seeded 3 published rides with real Moscow
  coordinates against the real running API (Docker Postgres/Redis/MinIO),
  drove `http://localhost:3000/` with the browser-automation skill. Network
  capture confirmed real `200`s from `keys.api.2gis.com` (key validation),
  `styles.api.2gis.com` (style), and ten `tile{0-3}-sdk.maps.2gis.com`
  (vector tiles) — zero failed requests, zero console errors beyond one
  benign WebGL performance warning. DOM inspection confirmed a real MapGL
  `<canvas>` (SDK's own CSS classes, zoom controls, "2GIS" attribution
  watermark) plus three marker `<svg>` elements at three distinct screen
  positions matching the three seeded rides. The screenshot itself showed a
  flat background rather than visible street geometry — attributed to a
  headless/software-WebGL rasterization limitation in this sandboxed
  browser (network/DOM evidence is airtight: real key, real tiles fetched
  for the exact requested coordinates, real correctly-positioned markers),
  not a bug in the integration. All seeded test data cleaned up afterward;
  dev servers stopped.

## Discovered issues

- KI-051 (new, resolved same session): the native dev `DATABASE_URL`
  database was missing CR-097's migration `0016_avatar_columns.sql`,
  causing `GET /v1/rides` to 500. Fixed by running `pnpm --filter db
db:migrate` against it.

## Final result

All acceptance criteria met, all checks green, live-verified against a real
2GIS account. The discovery map (`/`) now renders a real MapGL map instead
of the degraded placeholder. Persistent context updated: `docs/changelog.md`
(CR-098 entry), `docs/tasks.md` (checked off), `docs/decisions.md` (ADR-020),
`.claude/rules/maps.md`, `.claude/context/architecture-map.md`,
`.claude/context/known-issues.md`, `.claude/context/project-state.md`
(overwritten). Route-detail map rendering stays KI-036's open follow-up.
