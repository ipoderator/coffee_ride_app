// packages/maps-2gis — the only package allowed to speak to 2GIS directly
// (ADR-010). The Geocoder/Routing methods (`provider.ts`) are plain REST,
// called with the platform's native `fetch` — no vendor SDK object there.
// `render.ts` (ADR-020) is the one exception: it's the only file in this
// monorepo allowed to import `@2gis/mapgl`, the real MapGL JS SDK, and it's
// browser-only (never reachable from `apps/api`).
export * from './config.js';
export * from './errors.js';
export * from './provider.js';
export * from './render.js';
