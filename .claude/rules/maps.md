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

Lint-enforced, not convention-only (CR-056): every workspace member's `eslint.config.mjs`
carries a `no-restricted-imports` rule rejecting any import specifier matching `*2gis*`;
`packages/maps-2gis`'s own config is the one place that opts out
(`nodeLibraryConfig({ allowMapsSdkImports: true })`,
`packages/config/eslint/node-library.js`). `provider.ts`'s Geocoder/Directions methods
still call 2GIS's REST APIs via plain `fetch`, no SDK; `render.ts` (ADR-020, CR-098) is
the one real 2GIS SDK dependency in the monorepo (`@2gis/mapgl`), browser-only and
dynamically imported.

`apps/web` and `apps/api` depend only on `packages/maps-core`'s interface types plus
whichever concrete adapter is wired in at the composition point (a single place — e.g. a
provider factory read from config — not scattered imports). `apps/web/src/lib/maps/
create-map-renderer.ts` is that one composition point for rendering (ADR-020): the
`*2gis*` glob also matches the bare `maps-2gis` workspace specifier, not just a vendor
SDK name, so `apps/web/eslint.config.mjs` carries a `files`-scoped override for exactly
this one path rather than a blanket relaxation.

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
}
```

### Render-layer contract (`packages/maps-core/src/render.ts`, ADR-020)

Web-only — server code never imports this file. Kept separate from `MapProvider`
above since server code has no business seeing a render method at all.

```ts
export interface MapMarkerInput {
  id: string;
  point: LatLng;
}

export interface MapRenderOptions {
  container: HTMLElement;
  center: LatLng;
  zoom?: number;
}

export interface MapHandle {
  setMarkers(markers: MapMarkerInput[]): void;
  destroy(): void;
}

export interface MapRenderer {
  render(options: MapRenderOptions): Promise<MapHandle>;
}
```

`packages/maps-2gis/src/render.ts` implements this against the real `@2gis/mapgl` SDK,
converting to MapGL's own `[longitude, latitude]` coordinate order at this one boundary.

Every method must apply the resilience rules in `.claude/rules/resilience.md`
(timeout, bounded retries for idempotent calls, circuit breaker, defined fallback) at the
adapter implementation level (`packages/maps-2gis`), not scattered across callers.

If the provider is ever changed (see ADR-010), add a new `packages/maps-<provider>`
implementing the same `MapProvider` interface, switch the composition point, and record
the change as a new changelog entry plus an ADR update — the same discipline used for the
Yandex → 2GIS switch.
