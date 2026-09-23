// Provider-neutral map/geocoding/routing types (ADR-010, `.claude/rules/maps.md`).
// No vendor (2GIS or otherwise) import belongs anywhere in this package —
// that boundary is the entire point of the adapter split.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  point: LatLng;
  /** Human-readable resolved address/place. */
  label: string;
  confidence?: number;
}

export interface RouteRequest {
  /** Ordered waypoints. */
  points: LatLng[];
  profile: 'cycling' | 'driving' | 'walking';
}

/** A polyline vertex with the terrain elevation under it, when the provider
 * supplies one. */
export interface LatLngAlt extends LatLng {
  elevationMeters?: number;
}

export interface RouteResult {
  /** Provider-neutral polyline — the actual path along the provider's road
   * graph, never the bare request waypoints joined by straight lines. */
  geometry: LatLngAlt[];
  distanceMeters: number;
  durationSeconds: number;
}
