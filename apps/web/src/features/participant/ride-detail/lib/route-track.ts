import type { LatLng } from 'maps-core';
import type { RouteGeometryPoint } from 'types';
import { haversineDistanceKm } from './elevation-profile';

/**
 * CR-151: the route geometry with its running distance — what links the
 * elevation profile (x = km) to the dot on the cover (x, y = lat/lng) and
 * places each route point at «43 км» in the timeline. Built once per geometry
 * fetch; `cumulativeKm[i]` is the haversine length from the start to point `i`.
 */
export interface RouteTrack {
  points: RouteGeometryPoint[];
  cumulativeKm: number[];
  totalKm: number;
}

export function buildRouteTrack(
  points: RouteGeometryPoint[],
): RouteTrack | null {
  if (points.length < 2) return null;
  const cumulativeKm = [0];
  for (let i = 1; i < points.length; i += 1) {
    cumulativeKm.push(
      cumulativeKm[i - 1]! + haversineDistanceKm(points[i - 1]!, points[i]!),
    );
  }
  const totalKm = cumulativeKm[cumulativeKm.length - 1]!;
  return totalKm > 0 ? { points, cumulativeKm, totalKm } : null;
}

/** The point `km` along the route, interpolated between its two vertices. */
export function pointAtDistance(track: RouteTrack, km: number): LatLng {
  const target = Math.min(Math.max(km, 0), track.totalKm);
  let lo = 0;
  let hi = track.cumulativeKm.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track.cumulativeKm[mid]! <= target) lo = mid;
    else hi = mid;
  }
  const a = track.points[lo]!;
  const b = track.points[hi]!;
  const span = track.cumulativeKm[hi]! - track.cumulativeKm[lo]!;
  const t = span > 0 ? (target - track.cumulativeKm[lo]!) / span : 0;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

// A start/finish pin this close to the route's own first/last vertex is that
// end of the route — on a loop both ends are the same place, and "nearest
// vertex" alone would put the finish at km 0.
const ROUTE_END_SNAP_KM = 0.3;

/**
 * How far along the route a pin sits: the running distance of the nearest
 * route vertex. `start`/`finish` pins snap to the route's own ends when close
 * to them. An illustration for the timeline, not a routing result — an
 * out-and-back route can place a mid-route pin on the wrong leg.
 */
export function distanceAlongRoute(
  track: RouteTrack,
  point: LatLng,
  kind: 'start' | 'finish' | 'other' = 'other',
): number {
  const first = track.points[0]!;
  const last = track.points[track.points.length - 1]!;
  if (
    kind === 'start' &&
    haversineDistanceKm(point, first) <= ROUTE_END_SNAP_KM
  )
    return 0;
  if (
    kind === 'finish' &&
    haversineDistanceKm(point, last) <= ROUTE_END_SNAP_KM
  )
    return track.totalKm;
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < track.points.length; i += 1) {
    const distance = haversineDistanceKm(point, track.points[i]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return track.cumulativeKm[best]!;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * One projection for everything drawn on the cover (the track, its pins, the
 * scrub dot) so they line up: longitude scaled by `cos(mean latitude)` to keep
 * the route's real proportions, latitude flipped for SVG's downward `y`, fit
 * uniformly into `box` and centred. `minSpanKm` keeps a lone pin (or a few
 * close ones) from being blown up to the whole box. Same projection as the
 * discovery card's route cover (`projectRoutePreviewToBox`) — duplicated, not
 * imported: one feature module never reaches into another's internals
 * (`.claude/rules/extensibility.md`).
 */
export function fitProjection(
  points: readonly LatLng[],
  box: Box,
  minSpanKm = 0,
): ((point: LatLng) => [number, number]) | null {
  if (points.length === 0) return null;
  const meanLat =
    points.reduce((sum, point) => sum + point.lat, 0) / points.length;
  const lngScale = Math.cos((meanLat * Math.PI) / 180);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { lat, lng } of points) {
    minX = Math.min(minX, lng * lngScale);
    maxX = Math.max(maxX, lng * lngScale);
    minY = Math.min(minY, lat);
    maxY = Math.max(maxY, lat);
  }
  // ~111 km per degree of latitude (and of scaled longitude).
  const minSpan = minSpanKm / 111;
  const spanX = Math.max(maxX - minX, minSpan);
  const spanY = Math.max(maxY - minY, minSpan);
  if (spanX === 0 && spanY === 0) {
    const centre: [number, number] = [
      box.x + box.width / 2,
      box.y + box.height / 2,
    ];
    return () => centre;
  }
  const scale = Math.min(
    spanX === 0 ? Infinity : box.width / spanX,
    spanY === 0 ? Infinity : box.height / spanY,
  );
  const centreX = (minX + maxX) / 2;
  const centreY = (minY + maxY) / 2;
  return ({ lat, lng }) => [
    box.x + box.width / 2 + (lng * lngScale - centreX) * scale,
    box.y + box.height / 2 - (lat - centreY) * scale,
  ];
}
