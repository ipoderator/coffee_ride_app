import type { MapProvider } from 'maps-core';
import { CircuitBreaker } from 'resilience';
import type { TwoGisProviderConfig } from './config.js';
import { createGeocodeMethods } from './geocode.js';
import { createGetRoute } from './route.js';

// One breaker per provider instance, shared across geocode/reverseGeocode/
// getRoute (CR-049): it tracks "is 2GIS degraded right now" as one
// integration, not per-method — a run of failing geocode calls should also
// short-circuit getRoute rather than let it keep piling up requests against
// the same struggling provider (`.claude/rules/resilience.md`).
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

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
  const breaker = new CircuitBreaker({
    failureThreshold: BREAKER_FAILURE_THRESHOLD,
    cooldownMs: BREAKER_COOLDOWN_MS,
  });
  const { geocode, reverseGeocode } = createGeocodeMethods(config, breaker);
  const getRoute = createGetRoute(config, breaker);

  return { geocode, reverseGeocode, getRoute };
}
