# Maps Rules

Primary provider: 2GIS (MapGL JS API + Geocoder API + Directions/Routing API).

Initial use cases:

- map-based ride discovery;
- start/finish markers;
- route visualization;
- stops;
- route points;
- geocoding where needed.

Use provider-neutral internal concepts:

- latitude;
- longitude;
- geometry;
- distance;
- elevation;
- named point.

Do not expose raw 2GIS MapGL SDK objects (map instance, marker classes, event payloads,
etc.) to domain types. Convert at the integration boundary.

Before production integration verify credentials, quotas, domain restrictions,
licensing/terms (2GIS attribution requirements), geocoding/routing capabilities, and
GPX/GeoJSON handling.

## Adapter package split (ADR-010)

Map access is split into two packages so the provider can be swapped by writing a new
adapter package, without touching ride/route/discovery feature code:

- **`packages/maps-core`** — provider-neutral interface + types. No 2GIS (or any vendor)
  import anywhere in this package.
- **`packages/maps-2gis`** — the only package allowed to import the 2GIS SDK. Implements
  the `packages/maps-core` interface.

`apps/web` and `apps/api` depend only on `packages/maps-core`'s interface types plus
whichever concrete adapter is wired in at the composition point (a single place — e.g. a
provider factory read from config — not scattered imports).

### Interface contract (`packages/maps-core`)

```ts
export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeocodeResult {
  point: LatLng;
  label: string; // human-readable resolved address/place
  confidence?: number;
}

export interface RouteRequest {
  points: LatLng[]; // ordered waypoints
  profile: 'cycling' | 'driving' | 'walking';
}

export interface RouteResult {
  geometry: LatLng[]; // provider-neutral polyline as points, or GeoJSON LineString
  distanceMeters: number;
  durationSeconds: number;
}

export interface MapProvider {
  geocode(query: string): Promise<GeocodeResult[]>;
  reverseGeocode(point: LatLng): Promise<GeocodeResult | null>;
  getRoute(request: RouteRequest): Promise<RouteResult>;
  // Web-only rendering surface — server code never calls this.
  // Concrete shape (container element, options, returned map handle) is defined by
  // packages/maps-core for the render layer; kept provider-neutral at the type level,
  // implemented per-provider in packages/maps-2gis.
}
```

Every method must apply the resilience rules in `.claude/rules/resilience.md`
(timeout, bounded retries for idempotent calls, circuit breaker, defined fallback) at the
adapter implementation level (`packages/maps-2gis`), not scattered across callers.

If the provider is ever changed (see ADR-010), add a new `packages/maps-<provider>`
implementing the same `MapProvider` interface, switch the composition point, and record
the change as a new changelog entry plus an ADR update — the same discipline used for the
Yandex → 2GIS switch.
