import type { LatLngAlt, RouteRequest, RouteResult } from 'maps-core/server';
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
  RoutingResponseItem[] | { result?: RoutingResponseItem[] } | null;

function extractItems(body: RoutingResponse): RoutingResponseItem[] {
  if (body === null) return [];
  return Array.isArray(body) ? body : (body.result ?? []);
}

// Parses 2GIS's `"LINESTRING(lon lat, lon lat, ...)"` WKT string (note:
// longitude first, per the WKT spec) into provider-neutral points. With
// `need_altitudes` a vertex may carry a third number, its altitude
// (`LINESTRING Z(lon lat alt, ...)` or the same without the `Z`).
function parseWktLineString(wkt: string): LatLngAlt[] {
  const match = /LINESTRING\s*Z?\s*\(([^)]*)\)/i.exec(wkt);
  const coordinates = match?.[1];
  if (!coordinates) return [];
  return coordinates
    .split(',')
    .map((pair): LatLngAlt => {
      const [lng, lat, alt] = pair.trim().split(/\s+/).map(Number);
      const point: LatLngAlt = { lat: lat ?? NaN, lng: lng ?? NaN };
      if (alt !== undefined && Number.isFinite(alt)) {
        point.elevationMeters = alt;
      }
      return point;
    })
    .filter(
      (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
    );
}

// Consecutive maneuver segments share their joint vertex — drop the repeat
// so the polyline has no zero-length steps.
function dedupeConsecutive(points: LatLngAlt[]): LatLngAlt[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return (
      previous === undefined ||
      point.lat !== previous.lat ||
      point.lng !== previous.lng
    );
  });
}

function extractGeometry(item: RoutingResponseItem): LatLngAlt[] {
  const points =
    item.maneuvers
      ?.flatMap((maneuver) => maneuver.outcoming_path?.geometry ?? [])
      .flatMap((segment) => parseWktLineString(segment.selection)) ?? [];
  return dedupeConsecutive(points);
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
      // Terrain altitude per vertex, for the elevation profile/gain.
      need_altitudes: true,
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
        { code: 'no_route' },
      );
    }

    // Never substitute the request waypoints for a missing path: joined by
    // straight lines they cut across rivers, rail and relief — exactly what
    // a route built "on 2GIS roads" must not do.
    const geometry = extractGeometry(route);
    if (geometry.length < 2) {
      throw new MapProviderError(
        '2GIS routing response contained no route geometry.',
        { code: 'no_route' },
      );
    }

    return { geometry, distanceMeters, durationSeconds };
  };
}
