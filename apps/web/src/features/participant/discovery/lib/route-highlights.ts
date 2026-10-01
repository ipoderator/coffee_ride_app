import type { LatLng } from 'maps-core';

/** A point along a route line, with how far along it sits (0 = start, 1 = end,
 * by length) — the map's draw-in reaches it at `fraction * drawMs`. */
export interface LineMark {
  point: LatLng;
  fraction: number;
}

export interface ElevatedPoint extends LatLng {
  elevationMeters: number | null;
}

// A summit only means something on a route that actually climbs: below this
// spread between the lowest and highest point it is noise, not a top.
export const MIN_SUMMIT_CLIMB_METERS = 30;
// A "summit" at the very start or finish is just where the route begins or
// ends high — and would sit on the start pin. Skip those.
const SUMMIT_EDGE_MARGIN = 0.04;

/** Cumulative length along the line, in the same equirectangular measure the
 * map adapter draws with, so a mark's fraction matches the draw's timing. */
function cumulativeLengths(points: LatLng[]): number[] {
  const lengths = [0];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const kx = Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    lengths.push(
      lengths[i - 1]! + Math.hypot((b.lng - a.lng) * kx, b.lat - a.lat),
    );
  }
  return lengths;
}

/** The point halfway along the line by length — where the difficulty tag
 * sits. `null` for fewer than two points. */
export function lineMidpoint(points: LatLng[]): LineMark | null {
  if (points.length < 2) return null;
  const lengths = cumulativeLengths(points);
  const total = lengths[lengths.length - 1]!;
  if (total === 0) return { point: points[0]!, fraction: 0.5 };
  const target = total / 2;
  for (let i = 1; i < points.length; i += 1) {
    if (lengths[i]! >= target) {
      const start = lengths[i - 1]!;
      const t = (target - start) / (lengths[i]! - start || 1);
      const a = points[i - 1]!;
      const b = points[i]!;
      return {
        point: {
          lat: a.lat + (b.lat - a.lat) * t,
          lng: a.lng + (b.lng - a.lng) * t,
        },
        fraction: 0.5,
      };
    }
  }
  return { point: points[points.length - 1]!, fraction: 1 };
}

/** The highest point of a route with real elevation data — `null` when there
 * is no data, the climb is under `MIN_SUMMIT_CLIMB_METERS`, or the top is at
 * either end of the route. */
export function lineSummit(
  points: ElevatedPoint[],
): (LineMark & { elevationMeters: number }) | null {
  let top = -1;
  let min = Infinity;
  let max = -Infinity;
  points.forEach((point, i) => {
    if (point.elevationMeters === null) return;
    min = Math.min(min, point.elevationMeters);
    if (point.elevationMeters > max) {
      max = point.elevationMeters;
      top = i;
    }
  });
  if (top < 0 || max - min < MIN_SUMMIT_CLIMB_METERS) return null;
  const lengths = cumulativeLengths(points);
  const total = lengths[lengths.length - 1]!;
  const fraction = total > 0 ? lengths[top]! / total : 0;
  if (fraction < SUMMIT_EDGE_MARGIN || fraction > 1 - SUMMIT_EDGE_MARGIN) {
    return null;
  }
  const { lat, lng } = points[top]!;
  return { point: { lat, lng }, fraction, elevationMeters: max };
}
