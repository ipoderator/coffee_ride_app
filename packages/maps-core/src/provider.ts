import type {
  GeocodeResult,
  LatLng,
  RouteRequest,
  RouteResult,
} from './types.js';

/**
 * Provider-neutral map interface (ADR-010). `packages/maps-2gis` is the only
 * package allowed to implement this against a real vendor SDK/API today;
 * swapping providers later means writing a new `packages/maps-<provider>`
 * against this same interface, not touching ride/route/discovery feature
 * code (`.claude/rules/maps.md`).
 *
 * Every implementation must apply `.claude/rules/resilience.md` (timeout,
 * bounded retries for idempotent calls, circuit breaker, defined fallback)
 * at the adapter level — callers of this interface should never need to
 * re-implement resilience per call site.
 *
 * Browser map rendering is a separate concern, `MapRenderer` (`./render.js`)
 * — server code never renders a map, so it stays out of this interface.
 */
export interface MapProvider {
  geocode(query: string): Promise<GeocodeResult[]>;
  reverseGeocode(point: LatLng): Promise<GeocodeResult | null>;
  getRoute(request: RouteRequest): Promise<RouteResult>;
}
