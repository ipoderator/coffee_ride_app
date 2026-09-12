// packages/maps-2gis — the only package allowed to speak to 2GIS directly
// (ADR-010). No npm SDK dependency: the Geocoder and Routing APIs are plain
// REST, called with the platform's native `fetch` — there is no vendor SDK
// object to keep out of domain types here, only the request/response shapes
// below the `MapProvider` interface (`packages/maps-core`).
export * from './config.js';
export * from './errors.js';
export * from './provider.js';
