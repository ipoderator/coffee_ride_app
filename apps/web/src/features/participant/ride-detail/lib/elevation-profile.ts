import type { LatLng } from 'maps-core';

// CR-028 ("Route rendering"). `ElevationProfileChart`'s input is built from
// `maps-core`'s provider-neutral `LatLng` (`docs/design.md` §9: "`RideMap` and
// `ElevationProfile` consume `packages/maps-core` types only") extended with the one
// field a GPX track adds that a generic lat/lng pair doesn't carry.
export type ElevationProfileInputPoint = LatLng & {
  elevationMeters: number | null;
};

export interface ElevationProfilePoint {
  distanceKm: number;
  elevationMeters: number | null;
}

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

/**
 * Cumulative distance (haversine, full resolution) paired with each point's
 * elevation, then downsampled to at most `maxSamples` points for rendering — a real
 * GPX track can have thousands of points (CR-027/ADR-015), and an SVG path doesn't
 * need every one of them to look correct. Distance is accumulated *before*
 * downsampling so the chart's x-axis stays faithful to the real path rather than
 * drifting from cutting corners at low resolution. This is a rendering
 * simplification only — `Route.distanceKm`/`elevationGainMeters` (shown separately
 * via `MetricTile`) remain the authoritative, full-resolution, server-computed
 * numbers (`docs/design.md` §6: "the chart is an illustration, the number is the
 * fact").
 */
export function buildElevationProfile(
  points: ElevationProfileInputPoint[],
  maxSamples = 200,
): ElevationProfilePoint[] {
  if (points.length === 0) {
    return [];
  }

  const full: ElevationProfilePoint[] = [
    { distanceKm: 0, elevationMeters: points[0]!.elevationMeters },
  ];
  let cumulativeKm = 0;
  for (let i = 1; i < points.length; i++) {
    cumulativeKm += haversineDistanceKm(points[i - 1]!, points[i]!);
    full.push({
      distanceKm: cumulativeKm,
      elevationMeters: points[i]!.elevationMeters,
    });
  }

  return downsample(full, maxSamples);
}
