import { describe, expect, it } from 'vitest';
import { GpxParseError, parseGpx } from './gpx.js';

function gpx(trkpts: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`;
}

describe('parseGpx', () => {
  it('parses ordered geometry, and computes distance/elevation gain', () => {
    // Three points ~500m apart in latitude (1 degree of latitude ≈ 111.2 km, so
    // 0.0045deg ≈ 500m), elevation rising then falling — gain should only count the
    // rising leg (100 -> 150 = +50), never the falling one (150 -> 120).
    const parsed = parseGpx(
      gpx(
        '<trkpt lat="55.7500" lon="37.6000"><ele>100</ele></trkpt>' +
          '<trkpt lat="55.7545" lon="37.6000"><ele>150</ele></trkpt>' +
          '<trkpt lat="55.7590" lon="37.6000"><ele>120</ele></trkpt>',
      ),
    );

    expect(parsed.pointCount).toBe(3);
    expect(parsed.geometry).toEqual([
      { lat: 55.75, lng: 37.6, elevationMeters: 100 },
      { lat: 55.7545, lng: 37.6, elevationMeters: 150 },
      { lat: 55.759, lng: 37.6, elevationMeters: 120 },
    ]);
    // ~500m per leg * 2 legs ≈ 1.0km, within a reasonable tolerance for the
    // spherical-earth approximation.
    expect(parsed.distanceKm).toBeGreaterThan(0.9);
    expect(parsed.distanceKm).toBeLessThan(1.1);
    expect(parsed.elevationGainMeters).toBe(50);
  });

  it('treats a missing elevation on either side of a leg as no contribution to gain', () => {
    const parsed = parseGpx(
      gpx(
        '<trkpt lat="55.7500" lon="37.6000"><ele>100</ele></trkpt>' +
          '<trkpt lat="55.7545" lon="37.6000"></trkpt>' +
          '<trkpt lat="55.7590" lon="37.6000"><ele>200</ele></trkpt>',
      ),
    );

    expect(parsed.elevationGainMeters).toBe(0);
  });

  it('accepts a track point with no elevation at all', () => {
    const parsed = parseGpx(gpx('<trkpt lat="55.7500" lon="37.6000"></trkpt>'));

    expect(parsed.pointCount).toBe(1);
    expect(parsed.geometry[0]?.elevationMeters).toBeNull();
    expect(parsed.distanceKm).toBe(0);
    expect(parsed.elevationGainMeters).toBe(0);
  });

  it('rejects a GPX file with no track points', () => {
    expect(() => parseGpx(gpx(''))).toThrow(GpxParseError);
  });

  it('rejects malformed XML', () => {
    expect(() => parseGpx('<gpx><trk><trkseg>')).toThrow(GpxParseError);
  });

  it('rejects a trkpt missing lat/lon', () => {
    expect(() =>
      parseGpx(gpx('<trkpt lon="37.6000"><ele>100</ele></trkpt>')),
    ).toThrow(GpxParseError);
  });

  it('rejects a file that is not GPX/XML at all', () => {
    expect(() => parseGpx('not xml at all')).toThrow(GpxParseError);
  });
});
