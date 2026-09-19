import type { LatLng, RouteRequest, RouteResult } from 'maps-core';
import type { CircuitBreaker } from 'resilience';
import type { TwoGisProviderConfig } from './config.js';
import { DEFAULT_ROUTING_BASE_URL, DEFAULT_TIMEOUT_MS } from './config.js';
import { MapProviderError } from './errors.js';
import { fetchJson } from './http.js';

// 2GIS Routing API (https://docs.2gis.com/en/api/navigation/routing/overview),
// `POST {routingBaseUrl}/global`. Field names verified 2026-09-19 against a
// live key (KI-016): `total_distance`/`total_duration` are top-level on the
// route item as guessed, but the route polyline is NOT a flat `geometry`
// array of `{lat, lon}` — it is spread across `maneuvers[].outcoming_path.
// geometry[]`, each a WKT `LINESTRING(lon lat, lon lat, ...)` string (2GIS's
// `selection` field). The original `{lat, lon}`-point guess never matched
// anything and silently fell back to the requested waypoints every time.
const PROFILE_TO_TRANSPORT: Record<RouteRequest['profile'], string> = {
  cycling: 'bicycle',
  driving: 'driving',
  walking: 'walking',
};

interface GeometrySegment {
  selection: string;
}

interface Maneuver {
  outcoming_path?: {
    geometry?: GeometrySegment[];
  };
}

interface RoutingResponseItem {
  distance?: number;
  total_distance?: number;
  duration?: number;
  total_duration?: number;
  maneuvers?: Maneuver[];
}

type RoutingResponse =
  RoutingResponseItem[] | { result?: RoutingResponseItem[] };

function extractItems(body: RoutingResponse): RoutingResponseItem[] {
  return Array.isArray(body) ? body : (body.result ?? []);
}

// Parses 2GIS's `"LINESTRING(lon lat, lon lat, ...)"` WKT string (note:
// longitude first, per the WKT spec) into provider-neutral points.
function parseWktLineString(wkt: string): LatLng[] {
  const match = /LINESTRING\(([^)]*)\)/.exec(wkt);
  const coordinates = match?.[1];
  if (!coordinates) return [];
  return coordinates
    .split(',')
    .map((pair) => {
      const [lng, lat] = pair.trim().split(/\s+/).map(Number);
      return { lat: lat ?? NaN, lng: lng ?? NaN };
    })
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );
}

function extractGeometry(
  item: RoutingResponseItem,
  fallback: LatLng[],
): LatLng[] {
  const points = item.maneuvers
    ?.flatMap((maneuver) => maneuver.outcoming_path?.geometry ?? [])
    .flatMap((segment) => parseWktLineString(segment.selection));
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
