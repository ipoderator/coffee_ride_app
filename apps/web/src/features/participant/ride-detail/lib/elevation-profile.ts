import type { LatLng } from 'maps-core';

// CR-028 ("Route rendering"): the distance/downsampling helpers behind the
// elevation profile and, since CR-151, `route-track.ts`'s running distance.
// Provider-neutral `maps-core` `LatLng` only (`docs/design.md` §9).

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two points, in km. Duplicated on purpose from
 * `apps/api`'s `gpx.ts` — separate deployable, same small pure formula, same tier as
 * `apps/web`'s own `zoned-time.ts` vs. the API's own date handling. */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Evenly-spaced downsample, always keeping the first and last element. A no-op
 * once `points.length <= maxSamples`. */
export function downsample<T>(points: T[], maxSamples: number): T[] {
  if (points.length <= maxSamples || maxSamples < 2) {
    return points;
  }
  const step = (points.length - 1) / (maxSamples - 1);
  const result: T[] = [];
  for (let i = 0; i < maxSamples; i++) {
    result.push(points[Math.round(i * step)]!);
  }
  return result;
}
