import { describe, expect, it, vi } from 'vitest';
import {
  decodePolyline,
  distanceToTrack,
  matchActivity,
  routeCoverage,
  type RideForMatch,
} from './match.js';
import type { StravaActivitySummary } from './strava-client.js';
import { encodePolyline, line } from '../../test-support/polyline.js';

// Lipetsk → ~11 km east. 0.001° of latitude ≈ 111 m.
const A = { lat: 52.6, lng: 39.6 };
const B = { lat: 52.6, lng: 39.76 };
const ROUTE = line(A, B, 200);
const STARTS_AT = new Date('2026-10-04T07:00:00.000Z');

function ride(overrides: Partial<RideForMatch> = {}): RideForMatch {
  return {
    startsAt: STARTS_AT,
    routeGeometry: ROUTE,
    start: A,
    distanceKm: 11,
    ...overrides,
  };
}

function activity(
  overrides: Partial<StravaActivitySummary> = {},
): StravaActivitySummary {
  return {
    id: '20489295499',
    sportType: 'Ride',
    startDate: new Date(STARTS_AT.getTime() + 5 * 60_000),
    distanceMeters: 11_000,
    summaryPolyline: encodePolyline(ROUTE),
    ...overrides,
  };
}

describe('decodePolyline', () => {
  it("decodes Google's reference example", () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it('stops at a truncated or invalid string instead of throwing', async () => {
    expect(decodePolyline('_p~iF~ps|U_ulL')).toHaveLength(1);
    expect(decodePolyline('  ')).toEqual([]);
  });
});

describe('distanceToTrack', () => {
  it('measures to the nearest segment, not just the nearest vertex', async () => {
    const track = [A, B];
    const offset = { lat: A.lat + 0.001, lng: (A.lng + B.lng) / 2 };
    expect(distanceToTrack(offset, track)).toBeGreaterThan(100);
    expect(distanceToTrack(offset, track)).toBeLessThan(120);
  });
});

describe('routeCoverage', () => {
  it('is 1 for the same line and ~0.5 for half of it', async () => {
    expect(routeCoverage(ROUTE, ROUTE)).toBe(1);
    const half = ROUTE.slice(0, 100);
    expect(routeCoverage(ROUTE, half)).toBeGreaterThan(0.45);
    expect(routeCoverage(ROUTE, half)).toBeLessThan(0.56);
  });

  it('tolerates a track drifting 150 m off the route but not 300 m', async () => {
    const shifted = (meters: number) =>
      ROUTE.map((p) => ({ lat: p.lat + meters / 111_000, lng: p.lng }));
    expect(routeCoverage(ROUTE, shifted(150))).toBe(1);
    expect(routeCoverage(ROUTE, shifted(300))).toBe(0);
  });
});

describe('matchActivity', () => {
  it('verifies an outdoor ride that follows the route', async () => {
    expect(await matchActivity(ride(), [activity()])).toMatchObject({
      outcome: 'verified',
      activityId: '20489295499',
    });
  });

  it('ignores a virtual ride on the same track', async () => {
    expect(
      await matchActivity(ride(), [activity({ sportType: 'VirtualRide' })]),
    ).toMatchObject({ outcome: 'no_activity' });
  });

  it('ignores activities outside the start window', async () => {
    const early = new Date(STARTS_AT.getTime() - 91 * 60_000);
    const late = new Date(STARTS_AT.getTime() + 121 * 60_000);
    expect(
      await matchActivity(ride(), [
        activity({ startDate: early }),
        activity({ startDate: late }),
      ]),
    ).toMatchObject({ outcome: 'no_activity' });
  });

  it('accepts a start up to 90 minutes early and 120 late', async () => {
    const early = new Date(STARTS_AT.getTime() - 90 * 60_000);
    expect(
      (await matchActivity(ride(), [activity({ startDate: early })])).outcome,
    ).toBe('verified');
  });

  it('reports no_match for a bike ride elsewhere or without a track', async () => {
    const elsewhere = line(
      { lat: 55.75, lng: 37.6 },
      { lat: 55.75, lng: 37.8 },
    );
    expect(
      await matchActivity(ride(), [
        activity({ summaryPolyline: encodePolyline(elsewhere) }),
        activity({ id: '2', summaryPolyline: null }),
      ]),
    ).toMatchObject({ outcome: 'no_match' });
  });

  it('needs 70% of the route: 60% is not enough', async () => {
    const partial = encodePolyline(ROUTE.slice(0, 120));
    expect(
      (await matchActivity(ride(), [activity({ summaryPolyline: partial })]))
        .outcome,
    ).toBe('no_match');
  });

  it('picks the matching activity among several', async () => {
    const elsewhere = line(
      { lat: 55.75, lng: 37.6 },
      { lat: 55.75, lng: 37.8 },
    );
    expect(
      await matchActivity(ride(), [
        activity({ id: '1', summaryPolyline: encodePolyline(elsewhere) }),
        activity({ id: '2' }),
      ]),
    ).toMatchObject({ outcome: 'verified', activityId: '2' });
  });

  describe('a ride without a route', () => {
    const noRoute = ride({ routeGeometry: [] });

    it('verifies a track passing the meeting point with enough distance', async () => {
      expect((await matchActivity(noRoute, [activity()])).outcome).toBe(
        'verified',
      );
    });

    it('refuses a track that misses the meeting point', async () => {
      const away = line(
        { lat: A.lat + 0.02, lng: A.lng },
        { lat: B.lat + 0.02, lng: B.lng },
      );
      expect(
        (
          await matchActivity(noRoute, [
            activity({ summaryPolyline: encodePolyline(away) }),
          ])
        ).outcome,
      ).toBe('no_match');
    });

    it('refuses a ride far shorter than planned', async () => {
      expect(
        (await matchActivity(noRoute, [activity({ distanceMeters: 5000 })]))
          .outcome,
      ).toBe('no_match');
    });

    it('cannot verify without a meeting point either', async () => {
      expect(
        (
          await matchActivity(ride({ routeGeometry: [], start: null }), [
            activity(),
          ])
        ).outcome,
      ).toBe('no_match');
    });
  });
});

describe('matchActivity track sources and diagnostics', () => {
  it('reads a track from the source when the list has no polyline', async () => {
    const trackOf = vi.fn(async () => ROUTE);
    const result = await matchActivity(
      ride(),
      [activity({ summaryPolyline: null })],
      trackOf,
    );
    expect(result).toEqual({
      outcome: 'verified',
      activityId: '20489295499',
      diagnostics: { candidates: 1, withTrack: 1, bestCoverage: 1 },
    });
    expect(trackOf).toHaveBeenCalledTimes(1);
  });

  it('reports what it saw when nothing fits', async () => {
    const half = ROUTE.slice(0, 100);
    const result = await matchActivity(ride(), [
      activity({ summaryPolyline: encodePolyline(half) }),
      activity({ id: '2', summaryPolyline: null }),
    ]);
    expect(result.outcome).toBe('no_match');
    expect(result.diagnostics.candidates).toBe(2);
    expect(result.diagnostics.withTrack).toBe(1);
    expect(result.diagnostics.bestCoverage).toBeGreaterThan(0.45);
    expect(result.diagnostics.bestCoverage).toBeLessThan(0.56);
  });

  it('asks the source for at most three candidates', async () => {
    const trackOf = vi.fn(async () => null);
    const many = ['1', '2', '3', '4', '5'].map((id) =>
      activity({ id, summaryPolyline: null }),
    );
    const result = await matchActivity(ride(), many, trackOf);
    expect(result).toMatchObject({
      outcome: 'no_match',
      diagnostics: { candidates: 5, withTrack: 0, bestCoverage: null },
    });
    expect(trackOf).toHaveBeenCalledTimes(3);
  });
});
