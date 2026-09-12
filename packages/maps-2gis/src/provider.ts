import type { MapProvider } from 'maps-core';
import type { TwoGisProviderConfig } from './config.js';
import { createGeocodeMethods } from './geocode.js';
import { createGetRoute } from './route.js';

/**
 * The only place `MAPS_2GIS_API_KEY` (server-side Geocoder/Directions key,
 * never the public MapGL one — CR-071) is read into a `MapProvider`.
 *
 * Not wired into any route/use case yet — same "factory exists, no consumer
 * until one is justified" discipline as `apps/api`'s Redis (CR-005) and S3
 * (CR-006) clients. First real consumer decides where the composition point
 * lives (`.claude/rules/architecture.md`: "one composition point ... to wire
 * the concrete adapter") — likely CR-084 (geo query approach) or whichever
 * of CR-026/CR-028 needs it first.
 */
export function create2GisMapProvider(
  config: TwoGisProviderConfig,
): MapProvider {
  const { geocode, reverseGeocode } = createGeocodeMethods(config);
  const getRoute = createGetRoute(config);

  return { geocode, reverseGeocode, getRoute };
}
