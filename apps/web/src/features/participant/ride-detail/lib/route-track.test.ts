import { describe, expect, it } from 'vitest';
import {
  buildRouteTrack,
  distanceAlongRoute,
  fitProjection,
  pointAtDistance,
} from './route-track';

// ~0.5 km steps north along one meridian.
const LINE = [0, 1, 2, 3, 4].map((i) => ({
  lat: 55.75 + i * 0.0045,
  lng: 37.6,
  elevationMeters: 100 + i * 10,
}));

describe('buildRouteTrack (CR-151)', () => {
  it('accumulates the running distance from 0', () => {
    const track = buildRouteTrack(LINE)!;
    expect(track.cumulativeKm[0]).toBe(0);
    expect(track.cumulativeKm[2]).toBeCloseTo(1, 1);
    expect(track.totalKm).toBeCloseTo(2, 1);
  });

  it('is null for fewer than two points or a zero-length route', () => {
    expect(buildRouteTrack([])).toBeNull();
    expect(buildRouteTrack([LINE[0]!])).toBeNull();
    expect(buildRouteTrack([LINE[0]!, LINE[0]!])).toBeNull();
  });
});

describe('pointAtDistance', () => {
  const track = buildRouteTrack(LINE)!;

  it('interpolates between vertices and clamps to the ends', () => {
    const mid = pointAtDistance(track, track.cumulativeKm[1]! / 2);
    expect(mid.lat).toBeCloseTo((LINE[0]!.lat + LINE[1]!.lat) / 2, 5);
    expect(pointAtDistance(track, -5).lat).toBe(LINE[0]!.lat);
    expect(pointAtDistance(track, 999).lat).toBe(LINE[4]!.lat);
  });
});

describe('distanceAlongRoute', () => {
  it('places a pin at the running distance of its nearest vertex', () => {
    const track = buildRouteTrack(LINE)!;
    const km = distanceAlongRoute(track, { lat: LINE[3]!.lat, lng: 37.601 });
    expect(km).toBeCloseTo(track.cumulativeKm[3]!, 5);
  });

  it('snaps a loop finish to the end rather than to km 0', () => {
    const loop = [...LINE, { ...LINE[2]!, lng: 37.61 }, LINE[0]!];
    const track = buildRouteTrack(loop)!;
    expect(distanceAlongRoute(track, LINE[0]!, 'finish')).toBe(track.totalKm);
    expect(distanceAlongRoute(track, LINE[0]!, 'start')).toBe(0);
  });
});

describe('fitProjection', () => {
  const box = { x: 10, y: 20, width: 100, height: 50 };

  it('keeps every point inside the box and north up', () => {
    const project = fitProjection(LINE, box)!;
    const [x0, y0] = project(LINE[0]!);
    const [x4, y4] = project(LINE[4]!);
    for (const [x, y] of [
      [x0, y0],
      [x4, y4],
    ] as const) {
      expect(x).toBeGreaterThanOrEqual(10);
      expect(x).toBeLessThanOrEqual(110);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(70);
    }
    // The northern end is higher on screen.
    expect(y4).toBeLessThan(y0);
  });

  it('centres a single pin instead of dividing by zero', () => {
    expect(fitProjection([LINE[0]!], box)!(LINE[0]!)).toEqual([60, 45]);
  });

  it('frames at least minSpanKm around close pins', () => {
    const near = [LINE[0]!, LINE[1]!];
    const tight = fitProjection(near, box)!;
    const loose = fitProjection(near, box, 20)!;
    const spread = (project: typeof tight) =>
      Math.abs(project(near[0]!)[1] - project(near[1]!)[1]);
    expect(spread(loose)).toBeLessThan(spread(tight));
  });

  it('is null with nothing to project', () => {
    expect(fitProjection([], box)).toBeNull();
  });
});
