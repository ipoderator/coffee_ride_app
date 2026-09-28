import { ROUTE_PREVIEW_MAX_POINTS } from 'types';

// CR-116: `GET /v1/rides` items' `routePreview` — a small `[lat, lng]` sketch of the
// stored route for a discovery card, never used for navigation.
//
// KI-058: computed once, whenever a route's geometry is written (GPX upload/replace,
// `POST /v1/rides/:id/route/build`), into `routes.preview` — the list reads that
// small column instead of sampling every page's full geometry per request.
// {@link simplifyRoutePreview} keeps the shape-defining points (Douglas–Peucker by
// point budget) instead of just thinning the track at an even stride.

// ~1 m of latitude — plenty for a card-sized sketch, and keeps the payload small.
const COORDINATE_DECIMALS = 5;

function round(value: number): number {
  const factor = 10 ** COORDINATE_DECIMALS;
  return Math.round(value * factor) / factor;
}

/**
 * Perpendicular distance from `p` to the segment `a`–`b`, in plain degree space
 * (lng scaled by cos(lat) so east-west and north-south distances compare fairly at
 * Russian latitudes). Only the *ranking* of distances matters here, not their unit.
 */
function segmentDistance(
  p: [number, number],
  a: [number, number],
  b: [number, number],
  lngScale: number,
): number {
  const ax = a[1] * lngScale;
  const ay = a[0];
  const bx = b[1] * lngScale;
  const by = b[0];
  const px = p[1] * lngScale;
  const py = p[0];
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = Math.max(
    0,
    Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared),
  );
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Douglas–Peucker with a point budget instead of a tolerance: always keeps both
 * endpoints, then repeatedly splits whichever current segment has the farthest
 * outlying point, until `maxPoints` are kept or every remaining point lies exactly
 * on its segment. Returns `null` for fewer than two input points (nothing to draw).
 */
export function simplifyRoutePreview(
  points: Array<[number, number]>,
  maxPoints: number,
): Array<[number, number]> | null {
  if (points.length < 2) {
    return null;
  }
  if (points.length <= maxPoints) {
    return points.map(([lat, lng]) => [round(lat), round(lng)]);
  }

  const meanLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const lngScale = Math.cos((meanLat * Math.PI) / 180);

  const keep = new Set<number>([0, points.length - 1]);
  // Candidate split per open segment [start, end]: its farthest interior point.
  type Segment = {
    start: number;
    end: number;
    index: number;
    distance: number;
  };
  const farthest = (start: number, end: number): Segment => {
    let index = -1;
    let distance = -1;
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
    return { start, end, index, distance };
  };

  const segments: Segment[] = [farthest(0, points.length - 1)];
  while (keep.size < maxPoints) {
    let best = -1;
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      if (
        segment.index !== -1 &&
        segment.distance > 0 &&
        (best === -1 || segment.distance > segments[best]!.distance)
      ) {
        best = i;
      }
    }
    if (best === -1) {
      break;
    }
    const { start, end, index } = segments[best]!;
    keep.add(index);
    segments.splice(best, 1, farthest(start, index), farthest(index, end));
  }

  return [...keep]
    .sort((a, b) => a - b)
    .map((i) => {
      const [lat, lng] = points[i]!;
      return [round(lat), round(lng)];
    });
}

/**
 * KI-058: the stored `routes.preview` for a route geometry, from the full track.
 * `null` for fewer than two points (nothing to draw).
 */
export function buildRoutePreview(
  geometry: ReadonlyArray<{ lat: number; lng: number }>,
): Array<[number, number]> | null {
  return simplifyRoutePreview(
    geometry.map((point) => [point.lat, point.lng]),
    ROUTE_PREVIEW_MAX_POINTS,
  );
}
