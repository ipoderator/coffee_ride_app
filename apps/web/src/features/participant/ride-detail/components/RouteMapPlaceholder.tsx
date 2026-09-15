import { ErrorState, ROUTE_RENDERING_TERMS } from 'ui';

/**
 * `/rides/[id]`'s route map (CR-028). No `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` is
 * configured in this environment (KI-016/KI-031 — no live 2GIS credential), so a real
 * MapGL render would be unverifiable — same reasoning as discovery's
 * `RideMapPlaceholder` (CR-026). A separate, independent instance rather than a
 * shared import: `.claude/rules/extensibility.md` forbids one feature module
 * (`features/participant/discovery/`) reaching into another's internals
 * (`features/participant/ride-detail/`).
 */
export function RouteMapPlaceholder() {
  return (
    <ErrorState
      message={ROUTE_RENDERING_TERMS.mapUnavailable}
      tone="warning"
      variant="inline"
    />
  );
}
