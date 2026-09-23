import { describe, expect, it } from 'vitest';
import { simplifyRoutePreview } from './route-preview.js';

describe('simplifyRoutePreview', () => {
  it('returns null for fewer than two points', () => {
    expect(simplifyRoutePreview([], 40)).toBeNull();
    expect(simplifyRoutePreview([[55.75, 37.61]], 40)).toBeNull();
  });

  it('returns short input unchanged apart from rounding', () => {
    expect(
      simplifyRoutePreview(
        [
          [55.7512345, 37.6112345],
          [55.76, 37.62],
        ],
        40,
      ),
    ).toEqual([
      [55.75123, 37.61123],
      [55.76, 37.62],
    ]);
  });

  it('never exceeds the point budget and always keeps both endpoints', () => {
    const points: Array<[number, number]> = Array.from(
      { length: 200 },
      (_, i) => [55 + i * 0.001, 37 + Math.sin(i / 5) * 0.01],
    );
    const result = simplifyRoutePreview(points, 40)!;
    expect(result.length).toBeLessThanOrEqual(40);
    expect(result[0]).toEqual([55, 37]);
    expect(result[result.length - 1]).toEqual([
      Math.round((55 + 199 * 0.001) * 1e5) / 1e5,
      Math.round((37 + Math.sin(199 / 5) * 0.01) * 1e5) / 1e5,
    ]);
  });

  it('keeps the corner of an L-shaped route and drops collinear points', () => {
    const points: Array<[number, number]> = [
      ...Array.from(
        { length: 50 },
        (_, i) => [55 + i * 0.001, 37] as [number, number],
      ),
      ...Array.from(
        { length: 50 },
        (_, i) => [55.049, 37 + (i + 1) * 0.001] as [number, number],
      ),
    ];
    const result = simplifyRoutePreview(points, 40)!;
    expect(result).toEqual([
      [55, 37],
      [55.049, 37],
      [55.049, 37.05],
    ]);
  });
});
