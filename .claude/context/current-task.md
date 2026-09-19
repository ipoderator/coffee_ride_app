# Current task

## Task ID

CR-093 — Connect a live 2GIS Geocoder/Directions key, resolve KI-016.

## Goal

User supplied a real 2GIS API key ("подключи карту 2gis по api"). 2GIS
splits credentials into two unrelated products (CR-071): a public
`NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` (browser map rendering) and a private
`MAPS_2GIS_API_KEY` (server-side Geocoder/Directions, billed per request,
never shipped to the browser). Confirmed with the user which product the
key was issued for before touching anything, since the two have opposite
security postures.

## Requirements / acceptance criteria

- Key stored only where its product dictates (server-side key → `.env`
  only, never `.env.example`, never committed — `.env` is already
  `.gitignore`d).
- KI-016's documented "next action" (verify `packages/maps-2gis`'s
  geocode/route field-name guesses against a real 2GIS account) actually
  performed, not just assumed.
- Any real bug found gets fixed at the root and re-verified live, per
  CLAUDE.md's self-correction protocol — not papered over.

## Decision

- User confirmed the key is the server-side Geocoder/Directions product →
  set `MAPS_2GIS_API_KEY` in local `.env`. Did not touch
  `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` — that's a different key the user
  hasn't provided (KI-031 stays open).
- Verified live via a throwaway script calling `create2GisMapProvider`
  directly (deleted after use, never committed — not part of the package's
  source or tests).

## Bugs found and fixed

- `geocode`/`reverseGeocode`: field-name guesses (`point.lat`/`point.lon`,
  `full_name`) confirmed correct against the real API — no change needed.
- `getRoute`: `total_distance`/`total_duration` guess confirmed correct.
  The `geometry` guess was wrong and silently degraded on every call: the
  real polyline is under `maneuvers[].outcoming_path.geometry[]`, each a
  WKT `LINESTRING(lon lat, lon lat, ...)` string, not a flat `{lat, lon}`
  array. Fixed in `packages/maps-2gis/src/route.ts` (new
  `parseWktLineString`, rewritten `extractGeometry`); `provider.test.ts`'s
  fixture updated to the verified real shape.

## Validation results

- `pnpm --filter maps-2gis test`: 11/11 passing.
- `pnpm --filter maps-2gis typecheck`: clean.
- `pnpm --filter maps-2gis lint`: clean.
- `pnpm --filter maps-2gis... build` (maps-core, resilience, maps-2gis):
  green.
- Live re-check after the fix: `getRoute` now returns a real multi-point
  road-following polyline instead of the two-point waypoint fallback.

## Final result

CR-093 closed. `.env` has a live `MAPS_2GIS_API_KEY`; the adapter's
geocode/route parsing is now verified against a real account and its one
real bug fixed. KI-016 resolved. `create2GisMapProvider` still has zero
callers in `apps/api`/`apps/web` — wiring an actual consumer (KI-032's
geocode-by-address UI, or CR-028/CR-084's route rendering) is the natural
next step, not part of this ticket's scope. MapGL browser rendering
(KI-031) is unchanged — still blocked on a separate public key the user
has not provided. `docs/tasks.md`, `docs/changelog.md`,
`.claude/context/project-state.md`, `.claude/context/known-issues.md` all
updated.
