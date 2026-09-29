import type { LatLngAlt, RouteRequest, RouteResult } from 'maps-core/server';
import type { CircuitBreaker } from 'resilience';
import type { TwoGisProviderConfig } from './config.js';
import { DEFAULT_ROUTING_BASE_URL, DEFAULT_TIMEOUT_MS } from './config.js';
import { MapProviderError } from './errors.js';
import { fetchJson } from './http.js';
import { isRecord, optionalList, unexpectedShape } from './shape.js';

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

// Known shapes: a bare list of route items, `{ result: [...] }`, `null`
// (204 No Content — no route), or HTTP 200 with `{ type: 'error', status }`
// (live, CR-147: an island with no bridge answers `ROUTE_DOES_NOT_EXISTS`).
// Anything else is unexpected (CR-137).
const NO_ROUTE_STATUS = 'ROUTE_DOES_NOT_EXISTS';

function extractItems(body: unknown): unknown[] {
  if (body === null) return [];
  if (Array.isArray(body)) return body;
  if (isRecord(body) && body.type === 'error') {
    if (body.status === NO_ROUTE_STATUS) return [];
    throw new MapProviderError('2GIS routing answered with an error.');
  }
  if (isRecord(body) && Array.isArray(body.result)) return body.result;
  throw unexpectedShape('no route list');
}

// `distance`/`total_distance` (and the same for duration): absent is "no
// usable route", present but not a finite number is a malformed answer.
function readMetric(
  item: Record<string, unknown>,
  keys: [string, string],
): number | undefined {
  const value = item[keys[0]] ?? item[keys[1]];
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw unexpectedShape(`${keys[1]} is not a number`);
  }
  return value;
}

// Parses 2GIS's `"LINESTRING(lon lat, lon lat, ...)"` WKT string (note:
// longitude first, per the WKT spec) into provider-neutral points. With
// `need_altitudes` a vertex may carry a third number, its altitude
// (`LINESTRING Z(lon lat alt, ...)` or the same without the `Z`) — in
// centimetres: the first live run (CR-147) got 15820 for central Moscow.
const CENTIMETRES_PER_METRE = 100;

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
        point.elevationMeters = alt / CENTIMETRES_PER_METRE;
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

function extractGeometry(item: Record<string, unknown>): LatLngAlt[] {
  const points = optionalList(item.maneuvers, 'maneuvers')
    .flatMap((maneuver) => {
      const path = isRecord(maneuver) ? maneuver.outcoming_path : undefined;
      return optionalList(
        isRecord(path) ? path.geometry : undefined,
        'outcoming_path.geometry',
      );
    })
    // A segment without a WKT string contributes nothing, like a WKT with
    // no coordinates; too little geometry overall is `no_route` below.
    .flatMap((segment) => {
      const selection = isRecord(segment) ? segment.selection : undefined;
      return typeof selection === 'string' ? parseWktLineString(selection) : [];
    });
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
      points: request.points.map((point, index) => ({
        lat: point.lat,
        lon: point.lng,
        // Only the first/last point is a `stop`; a `stop` in the middle is
        // silently dropped from routing (2GIS collapses the whole request to
        // a point-to-point route between the first and last `stop`, verified
        // live 2026-09-29 — a closed loop's shared start/end point came back
        // as a near-zero-length route). Intermediate points must be `pref`.
        type:
          index === 0 || index === request.points.length - 1 ? 'stop' : 'pref',
      })),
      transport: PROFILE_TO_TRANSPORT[request.profile],
      // Terrain altitude per vertex, for the elevation profile/gain.
      need_altitudes: true,
    };

    const body = await fetchJson(
      url.toString(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      timeoutMs,
      breaker,
    );

    const [route] = extractItems(body);
    if (route !== undefined && !isRecord(route)) {
      throw unexpectedShape('route item is not an object');
    }
    const distanceMeters =
      route && readMetric(route, ['distance', 'total_distance']);
    const durationSeconds =
      route && readMetric(route, ['duration', 'total_duration']);

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
