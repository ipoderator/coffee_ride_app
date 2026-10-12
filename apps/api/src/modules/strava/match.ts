import type { StravaActivitySummary } from './strava-client.js';

// CR-234 (ADR-033): does one of the participant's Strava activities show they rode
// *this* ride? Pure — no I/O — so every threshold is unit-tested on its own.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RideForMatch {
  startsAt: Date;
  // The ride's stored route line (`routes.geometry`); empty when it has no route.
  routeGeometry: LatLng[];
  // Fallback when there is no route: the meeting point and planned distance.
  start: LatLng | null;
  distanceKm: number | null;
}

// What the check saw — for the server log only (counts and a ratio, never a
// coordinate or another Strava value).
export interface MatchDiagnostics {
  candidates: number;
  withTrack: number;
  bestCoverage: number | null;
}

export type MatchResult = (
  | { outcome: 'verified'; activityId: string }
  | { outcome: 'no_activity' }
  | { outcome: 'no_match' }
) & { diagnostics: MatchDiagnostics };

/** Where a candidate's track comes from; `null` when it has none. */
export type TrackSource = (
  activity: StravaActivitySummary,
) => Promise<LatLng[] | null>;

export const summaryTrack: TrackSource = async (activity) =>
  activity.summaryPolyline ? decodePolyline(activity.summaryPolyline) : null;

// Riders often press «Start» at the meeting point well before the official start,
// and a late group can roll out an hour after it.
export const ACTIVITY_WINDOW_BEFORE_MS = 90 * 60_000;
export const ACTIVITY_WINDOW_AFTER_MS = 120 * 60_000;
// Owner decision (2026-10-11): ≥70% of the route within 200 m of the activity track.
export const ROUTE_COVERAGE_MIN = 0.7;
export const ROUTE_TOLERANCE_M = 200;
// No route: the track must pass the meeting point and cover most of the distance.
export const START_TOLERANCE_M = 1000;
export const DISTANCE_SHARE_MIN = 0.7;
// Enough to describe a 300 km route's shape while keeping the check cheap.
const MAX_ROUTE_SAMPLES = 300;
// A track may cost a Strava call (`TrackSource`), so only the first few candidates
// are tried — the same ride recorded by two devices is the realistic maximum.
export const MAX_CANDIDATES = 3;

// Outdoor cycling only — `VirtualRide` (Zwift, ROUVY) is a trainer session.
export const BIKE_SPORT_TYPES = new Set([
  'Ride',
  'GravelRide',
  'MountainBikeRide',
  'EBikeRide',
  'EMountainBikeRide',
  'Velomobile',
  'Handcycle',
]);

export function activityWindow(startsAt: Date): { after: Date; before: Date } {
  return {
    after: new Date(startsAt.getTime() - ACTIVITY_WINDOW_BEFORE_MS),
    before: new Date(startsAt.getTime() + ACTIVITY_WINDOW_AFTER_MS),
  };
}

export async function matchActivity(
  ride: RideForMatch,
  activities: StravaActivitySummary[],
  trackOf: TrackSource = summaryTrack,
): Promise<MatchResult> {
  const { after, before } = activityWindow(ride.startsAt);
  const candidates = activities.filter(
    (activity) =>
      BIKE_SPORT_TYPES.has(activity.sportType) &&
      activity.startDate >= after &&
      activity.startDate <= before,
  );
  const diagnostics: MatchDiagnostics = {
    candidates: candidates.length,
    withTrack: 0,
    bestCoverage: null,
  };
  if (candidates.length === 0) {
    return { outcome: 'no_activity', diagnostics };
  }

  for (const activity of candidates.slice(0, MAX_CANDIDATES)) {
    const track = await trackOf(activity);
    if (!track || track.length < 2) continue;
    diagnostics.withTrack++;
    const score = fitScore(ride, track, activity.distanceMeters);
    diagnostics.bestCoverage = Math.max(diagnostics.bestCoverage ?? 0, score);
    if (score >= ROUTE_COVERAGE_MIN) {
      return { outcome: 'verified', activityId: activity.id, diagnostics };
    }
  }
  return { outcome: 'no_match', diagnostics };
}

// 0..1 against `ROUTE_COVERAGE_MIN`: the route's covered share, or — without a
// route — 1 when the track passes the meeting point with enough distance, else 0.
function fitScore(
  ride: RideForMatch,
  track: LatLng[],
  distanceMeters: number,
): number {
  if (ride.routeGeometry.length >= 2) {
    return routeCoverage(ride.routeGeometry, track);
  }
  if (!ride.start) {
    return 0;
  }
  if (distanceToTrack(ride.start, track) > START_TOLERANCE_M) {
    return 0;
  }
  return ride.distanceKm === null ||
    distanceMeters >= ride.distanceKm * 1000 * DISTANCE_SHARE_MIN
    ? 1
    : 0;
}

/** Share (0..1) of sampled route points lying within the tolerance of the track. */
export function routeCoverage(route: LatLng[], track: LatLng[]): number {
  const samples = sample(route, MAX_ROUTE_SAMPLES);
  let covered = 0;
  for (const point of samples) {
    if (distanceToTrack(point, track) <= ROUTE_TOLERANCE_M) covered++;
  }
  return covered / samples.length;
}

function sample(points: LatLng[], max: number): LatLng[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]!);
}

const EARTH_RADIUS_M = 6_371_000;
const RAD = Math.PI / 180;

/**
 * Shortest distance in metres from `point` to the polyline `track`. Equirectangular
 * projection around `point` — exact enough at the few-hundred-metre scale it decides.
 */
export function distanceToTrack(point: LatLng, track: LatLng[]): number {
  const cosLat = Math.cos(point.lat * RAD);
  const project = (p: LatLng) => ({
    x: (p.lng - point.lng) * RAD * cosLat * EARTH_RADIUS_M,
    y: (p.lat - point.lat) * RAD * EARTH_RADIUS_M,
  });
  let best = Infinity;
  let previous = project(track[0]!);
  if (track.length === 1) return Math.hypot(previous.x, previous.y);
  for (let i = 1; i < track.length; i++) {
    const current = project(track[i]!);
    best = Math.min(best, distanceToSegment(previous, current));
    previous = current;
  }
  return best;
}

// Distance from the origin to segment a–b.
function distanceToSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengthSquared));
  return Math.hypot(a.x + t * dx, a.y + t * dy);
}

/** Google's encoded polyline format (precision 5), as Strava's `summary_polyline`. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  while (index < encoded.length) {
    const dLat = readValue();
    const dLng = readValue();
    if (dLat === null || dLng === null) break;
    lat += dLat;
    lng += dLng;
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;

  function readValue(): number | null {
    let result = 0;
    let shift = 0;
    for (;;) {
      if (index >= encoded.length) return null;
      const byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
      if (byte < 0x20) break;
      if (shift > 30) return null;
    }
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
