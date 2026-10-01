import { describe, expect, it } from 'vitest';
import {
  MIN_SUMMIT_CLIMB_METERS,
  lineMidpoint,
  lineSummit,
} from './route-highlights';

const flat = (elevations: Array<number | null>) =>
  elevations.map((elevationMeters, i) => ({
    lat: 0,
    lng: i,
    elevationMeters,
  }));

describe('lineMidpoint', () => {
  it('is halfway along the line by length, not by vertex count', () => {
    const mark = lineMidpoint([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 0.5 },
      { lat: 0, lng: 1 },
      { lat: 0, lng: 4 },
    ]);
    expect(mark!.fraction).toBe(0.5);
    expect(mark!.point.lng).toBeCloseTo(2);
    expect(mark!.point.lat).toBeCloseTo(0);
  });

  it('is null for fewer than two points', () => {
    expect(lineMidpoint([{ lat: 1, lng: 1 }])).toBeNull();
  });
});

describe('lineSummit', () => {
  it('marks the highest point and how far along it is', () => {
    const summit = lineSummit(flat([120, 150, 214, 180, 130]));
    expect(summit).toEqual({
      point: { lat: 0, lng: 2 },
      fraction: 0.5,
      elevationMeters: 214,
    });
  });

  it('skips a route that barely climbs', () => {
    expect(
      lineSummit(flat([100, 100 + MIN_SUMMIT_CLIMB_METERS - 1, 100])),
    ).toBeNull();
  });

  it('skips a top at the start or the finish', () => {
    expect(lineSummit(flat([300, 200, 150, 120, 100]))).toBeNull();
    expect(lineSummit(flat([100, 120, 150, 200, 300]))).toBeNull();
  });

  it('is null without elevation data, ignoring missing points', () => {
    expect(lineSummit(flat([null, null, null]))).toBeNull();
    expect(lineSummit(flat([100, null, 180, null, 100]))!.elevationMeters).toBe(
      180,
    );
  });
});
