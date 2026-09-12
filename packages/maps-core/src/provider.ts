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
 */
export interface MapProvider {
  geocode(query: string): Promise<GeocodeResult[]>;
  reverseGeocode(point: LatLng): Promise<GeocodeResult | null>;
  getRoute(request: RouteRequest): Promise<RouteResult>;
  // Web-only rendering surface — server code never calls this. Concrete
  // shape (container element, options, returned map handle) is defined by
  // this package for the render layer, kept provider-neutral at the type
  // level; implemented per-provider in packages/maps-2gis. Not added yet:
  // nothing renders a map today (map discovery is CR-026, route rendering is
  // CR-028) — adding an unused rendering surface now would be speculative.
}
