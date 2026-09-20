import { ErrorState, RIDE_DISCOVERY_TERMS } from 'ui';

/**
 * `/`'s map view degraded state (CR-026, kept live by CR-098/ADR-020).
 * `DiscoveryMap` falls back to this whenever `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY`
 * is missing or a real MapGL render fails. `.claude/rules/resilience.md`:
 * "the frontend must handle a degraded API response ... with a clear
 * partial-failure UI state, not a blank screen" — the same principle applies
 * to a missing map credential or a failed render. Reuses `ErrorState`'s
 * existing degraded pattern (`tone="warning"`, `variant="inline"`, CR-066)
 * instead of a new component.
 */
export function RideMapPlaceholder() {
  return (
    <ErrorState
      message={RIDE_DISCOVERY_TERMS.mapUnavailable}
      tone="warning"
      variant="inline"
    />
  );
}
