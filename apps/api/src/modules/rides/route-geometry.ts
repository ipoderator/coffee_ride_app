import type { RouteGeometryPoint } from './gpx.js';

// CR-217 (KI-093 lead 1): `routes.geometry` is what `GET /v1/rides/:id/route/geometry`
// serves — anonymously, on every ride page view. A 10 MiB GPX holds ~437k points, and
// each read parsed, validated and re-serialized all of them on the event loop. The
// stored geometry is for drawing the line, so it is capped when written; the original
// file stays in object storage for `GET .../route/download`, and distance/elevation
// are computed from the full track before this runs.
//
// 5,000 points keep a 300 km route at ~60 m spacing on average — and far denser on
// bends, since Douglas–Peucker keeps the shape-defining points.
export const ROUTE_GEOMETRY_MAX_POINTS = 5000;

// ~1 m of latitude — the first tolerance tried; doubled until the budget fits.
const INITIAL_TOLERANCE_DEGREES = 0.00001;
const PRE_THIN_FACTOR = 4;

/**
 * Douglas–Peucker by tolerance (iterative, so a long track can't overflow the
 * stack), retried with a doubled tolerance until at most `maxPoints` remain.
 * Endpoints are always kept; elevation travels with each kept point.
 */
export function simplifyRouteGeometry(
  points: RouteGeometryPoint[],
  maxPoints: number = ROUTE_GEOMETRY_MAX_POINTS,
): RouteGeometryPoint[] {
  if (points.length <= maxPoints) {
    return points;
  }
  // A track this dense (a GPX logged every second) is first thinned at an even
  // stride: Douglas–Peucker's cost grows with the input, and at 4x the budget the
  // stride still keeps a point every few seconds of riding.
  points = thinByStride(points, PRE_THIN_FACTOR * maxPoints);

  const meanLat = points.reduce((sum, p) => sum + p.lat, 0) / points.length;
  const lngScale = Math.cos((meanLat * Math.PI) / 180);

  for (let tolerance = INITIAL_TOLERANCE_DEGREES; ; tolerance *= 2) {
    const keep = keepWithinTolerance(points, tolerance, lngScale);
    if (keep.length <= maxPoints) {
      return keep.map((i) => points[i]!);
    }
  }
}

function thinByStride(
  points: RouteGeometryPoint[],
  target: number,
): RouteGeometryPoint[] {
  if (points.length <= target) {
    return points;
  }
  const stride = Math.ceil(points.length / target);
  const thinned = points.filter((_, i) => i % stride === 0);
  if (thinned.at(-1) !== points.at(-1)) {
    thinned.push(points.at(-1)!);
  }
  return thinned;
}

function keepWithinTolerance(
  points: RouteGeometryPoint[],
  tolerance: number,
  lngScale: number,
): number[] {
  const kept = new Uint8Array(points.length);
  kept[0] = 1;
  kept[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    let index = -1;
    let distance = tolerance;
    for (let i = start + 1; i < end; i++) {
      const d = segmentDistance(
        points[i]!,
        points[start]!,
        points[end]!,
        lngScale,
      );
      if (d > distance) {
        distance = d;
        index = i;
      }
    }
    if (index !== -1) {
      kept[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    if (kept[i]) indices.push(i);
  }
  return indices;
}

// Same planar approximation as `route-preview.ts`: lng scaled by cos(lat), degrees.
function segmentDistance(
  p: RouteGeometryPoint,
  a: RouteGeometryPoint,
  b: RouteGeometryPoint,
  lngScale: number,
): number {
  const ax = a.lng * lngScale;
  const bx = b.lng * lngScale;
  const px = p.lng * lngScale;
  const dx = bx - ax;
  const dy = b.lat - a.lat;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - ax, p.lat - a.lat);
  }
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (p.lat - a.lat) * dy) / lengthSquared),
  );
  return Math.hypot(px - (ax + t * dx), p.lat - (a.lat + t * dy));
}
