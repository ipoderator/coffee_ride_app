import { ErrorState, RIDE_DISCOVERY_TERMS } from 'ui';

/**
 * `/`'s map view (CR-026). No `NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY` is configured in this
 * environment (KI-016 — no live 2GIS credential), so a real MapGL render would be
 * unverifiable. `.claude/rules/resilience.md`: "the frontend must handle a degraded
 * API response ... with a clear partial-failure UI state, not a blank screen" — the
 * same principle applies to a missing map credential. Reuses `ErrorState`'s existing
 * degraded pattern (`tone="warning"`, `variant="inline"`, CR-066) instead of a new
 * component. The live 2GIS MapGL integration itself is a new known issue, blocked on
 * KI-016 — not attempted here.
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
