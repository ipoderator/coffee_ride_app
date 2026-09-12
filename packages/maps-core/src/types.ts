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

export interface RouteResult {
  /** Provider-neutral polyline as points, or GeoJSON LineString. */
  geometry: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
}
