import type { FastifyInstance } from 'fastify';
import { create2GisMapProvider } from 'maps-2gis/server';
import type { MapProvider } from 'maps-core/server';
import type { Env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    mapProvider: MapProvider | null;
  }
}

// Routing a multi-waypoint ride can take 2GIS a few seconds — longer than
// the adapter's 5s geocoder-oriented default leaves comfortable room for.
const ROUTING_TIMEOUT_MS = 10_000;

/**
 * apps/api's one composition point for maps (ADR-010,
 * `.claude/rules/architecture.md`): the only place the concrete 2GIS adapter
 * is instantiated. Everything else sees `maps-core`'s `MapProvider`. Same
 * decorate-or-null shape as `plugins/email.ts`: no `MAPS_2GIS_API_KEY` means
 * `app.mapProvider === null`, and callers answer with their own degraded
 * state instead of throwing (`.claude/rules/resilience.md`).
 */
export function registerMaps(app: FastifyInstance, env: Env) {
  app.decorate(
    'mapProvider',
    env.MAPS_2GIS_API_KEY
      ? create2GisMapProvider({
          apiKey: env.MAPS_2GIS_API_KEY,
          timeoutMs: ROUTING_TIMEOUT_MS,
        })
      : null,
  );
}
