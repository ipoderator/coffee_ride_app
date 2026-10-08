import { describe, expect, it } from 'vitest';
import type { RouteGeometryPoint } from './gpx.js';
import {
  ROUTE_GEOMETRY_MAX_POINTS,
  simplifyRouteGeometry,
} from './route-geometry.js';

// A wiggly eastbound track: `count` points, ~11 m apart, with a sine-wave offset so
// Douglas–Peucker has real shape to keep.
function track(count: number): RouteGeometryPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lat: 55.75 + 0.002 * Math.sin(i / 50),
    lng: 37.6 + i * 0.0001,
    elevationMeters: 150 + (i % 7),
  }));
}

describe('simplifyRouteGeometry', () => {
  it('returns a track within the budget unchanged', () => {
    const points = track(100);
    expect(simplifyRouteGeometry(points, 100)).toBe(points);
  });

  it('caps a long track at the budget, keeping both endpoints and elevations', () => {
    const points = track(60_000);

    const simplified = simplifyRouteGeometry(points);

    expect(simplified.length).toBeLessThanOrEqual(ROUTE_GEOMETRY_MAX_POINTS);
    expect(simplified.length).toBeGreaterThan(100);
    expect(simplified[0]).toBe(points[0]);
    expect(simplified.at(-1)).toBe(points.at(-1));
    // Kept points are the original objects, in order — elevation travels along.
    let last = -1;
    for (const point of simplified) {
      const index = points.indexOf(point);
      expect(index).toBeGreaterThan(last);
      last = index;
    }
  });

  it('collapses a straight line to its endpoints', () => {
    const line = Array.from({ length: 50 }, (_, i) => ({
      lat: 55.75,
      lng: 37.6 + i * 0.001,
      elevationMeters: null,
    }));

    expect(simplifyRouteGeometry(line, 10)).toEqual([line[0], line[49]]);
  });

  it('handles repeated points (zero-length segments)', () => {
    const point = { lat: 55.75, lng: 37.6, elevationMeters: null };
    const stuck = [...Array.from({ length: 20 }, () => point), track(1)[0]!];

    const simplified = simplifyRouteGeometry(stuck, 5);

    expect(simplified.length).toBeLessThanOrEqual(5);
    expect(simplified[0]).toBe(point);
  });
});
