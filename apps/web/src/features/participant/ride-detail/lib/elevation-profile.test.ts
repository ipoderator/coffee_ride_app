import { describe, expect, it } from 'vitest';
import { downsample, haversineDistanceKm } from './elevation-profile';

describe('haversineDistanceKm', () => {
  it('returns 0 for identical points', () => {
    expect(
      haversineDistanceKm({ lat: 55.75, lng: 37.6 }, { lat: 55.75, lng: 37.6 }),
    ).toBe(0);
  });

  it('computes a known short distance within a small margin', () => {
    // Roughly 0.5 km apart along a meridian (~0.0045° latitude).
    const distance = haversineDistanceKm(
      { lat: 55.75, lng: 37.6 },
      { lat: 55.7545, lng: 37.6 },
    );
    expect(distance).toBeGreaterThan(0.45);
    expect(distance).toBeLessThan(0.55);
  });
});

describe('downsample', () => {
  it('returns the input unchanged when already within the cap', () => {
    const points = [1, 2, 3];
    expect(downsample(points, 10)).toEqual(points);
  });

  it('reduces to exactly maxSamples, keeping the first and last element', () => {
    const points = Array.from({ length: 1000 }, (_, i) => i);
    const result = downsample(points, 200);
    expect(result).toHaveLength(200);
    expect(result[0]).toBe(0);
    expect(result[result.length - 1]).toBe(999);
  });
});
