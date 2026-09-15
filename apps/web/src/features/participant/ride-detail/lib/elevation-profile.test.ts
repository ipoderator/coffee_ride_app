import { describe, expect, it } from 'vitest';
import {
  buildElevationProfile,
  downsample,
  haversineDistanceKm,
} from './elevation-profile';

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

describe('buildElevationProfile', () => {
  it('returns an empty array for no points', () => {
    expect(buildElevationProfile([])).toEqual([]);
  });

  it('starts at distanceKm 0 and accumulates monotonically', () => {
    const profile = buildElevationProfile([
      { lat: 55.75, lng: 37.6, elevationMeters: 100 },
      { lat: 55.7545, lng: 37.6, elevationMeters: 150 },
      { lat: 55.759, lng: 37.6, elevationMeters: 120 },
    ]);

    expect(profile).toHaveLength(3);
    expect(profile[0]!.distanceKm).toBe(0);
    expect(profile[0]!.elevationMeters).toBe(100);
    expect(profile[1]!.distanceKm).toBeGreaterThan(0);
    expect(profile[2]!.distanceKm).toBeGreaterThan(profile[1]!.distanceKm);
    expect(profile[2]!.elevationMeters).toBe(120);
  });

  it('preserves a null elevation rather than coercing it to 0', () => {
    const profile = buildElevationProfile([
      { lat: 55.75, lng: 37.6, elevationMeters: null },
      { lat: 55.7545, lng: 37.6, elevationMeters: null },
    ]);

    expect(profile.every((point) => point.elevationMeters === null)).toBe(true);
  });

  it('downsamples a large track to at most maxSamples points', () => {
    const points = Array.from({ length: 5000 }, (_, i) => ({
      lat: 55.75 + i * 0.0001,
      lng: 37.6,
      elevationMeters: 100 + (i % 10),
    }));

    const profile = buildElevationProfile(points, 200);

    expect(profile.length).toBeLessThanOrEqual(200);
    // Distance is accumulated at full resolution before downsampling, so the total
    // distance still reflects the whole track, not just the sampled segments.
    expect(profile[profile.length - 1]!.distanceKm).toBeGreaterThan(0);
  });
});
