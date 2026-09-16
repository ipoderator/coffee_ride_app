import type { LatLng, RouteRequest, RouteResult } from 'maps-core';
import type { CircuitBreaker } from 'resilience';
import type { TwoGisProviderConfig } from './config.js';
import { DEFAULT_ROUTING_BASE_URL, DEFAULT_TIMEOUT_MS } from './config.js';
import { MapProviderError } from './errors.js';
import { fetchJson } from './http.js';

// 2GIS Routing API (https://docs.2gis.com/en/api/navigation/routing/overview),
// `POST {routingBaseUrl}/global`. Field names below (`distance`/`duration`/
// `geometry`) are this adapter's best-documented guess, never exercised
// against a live key or response this session (no credential available —
// KI-016). Parsing is deliberately defensive (falls back to the requested
// waypoints as the geometry if the response doesn't carry one) rather than
// asserting an exact shape it cannot verify; distance/duration are the one
// thing every route response is expected to carry, so their absence still
// fails loudly.
const PROFILE_TO_TRANSPORT: Record<RouteRequest['profile'], string> = {
  cycling: 'bicycle',
  driving: 'driving',
  walking: 'walking',
};

interface RoutingResponseItem {
  distance?: number;
  total_distance?: number;
  duration?: number;
  total_duration?: number;
  geometry?: Array<{ lat: number; lon: number } | { selection: string }>;
  waypoints?: Array<{ point?: { lat: number; lon: number } }>;
}

type RoutingResponse =
  RoutingResponseItem[] | { result?: RoutingResponseItem[] };

function extractItems(body: RoutingResponse): RoutingResponseItem[] {
  return Array.isArray(body) ? body : (body.result ?? []);
}

function extractGeometry(
  item: RoutingResponseItem,
  fallback: LatLng[],
): LatLng[] {
  const points = item.geometry
    ?.map((point) =>
      'lat' in point && 'lon' in point
        ? { lat: point.lat, lng: point.lon }
        : null,
    )
    .filter((point): point is LatLng => point !== null);
  return points && points.length > 0 ? points : fallback;
}

export function createGetRoute(
  config: TwoGisProviderConfig,
  breaker: CircuitBreaker,
) {
  const baseUrl = config.routingBaseUrl ?? DEFAULT_ROUTING_BASE_URL;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async function getRoute(request: RouteRequest): Promise<RouteResult> {
    const url = new URL(`${baseUrl}/global`);
    url.searchParams.set('key', config.apiKey);

    const requestBody = {
      points: request.points.map((point) => ({
        lat: point.lat,
        lon: point.lng,
        type: 'stop',
      })),
      transport: PROFILE_TO_TRANSPORT[request.profile],
    };

    const body = (await fetchJson(
      url.toString(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      timeoutMs,
      breaker,
    )) as RoutingResponse;

    const [route] = extractItems(body);
    const distanceMeters = route?.distance ?? route?.total_distance;
    const durationSeconds = route?.duration ?? route?.total_duration;

    if (
      route === undefined ||
      distanceMeters === undefined ||
      durationSeconds === undefined
    ) {
      throw new MapProviderError(
        '2GIS routing response did not contain a usable route.',
      );
    }

    return {
      geometry: extractGeometry(route, request.points),
      distanceMeters,
      durationSeconds,
    };
  };
}
