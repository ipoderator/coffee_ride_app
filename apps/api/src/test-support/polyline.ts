import type { LatLng } from '../modules/strava/match.js';

// Test-only: the inverse of `decodePolyline`, so tests can describe tracks as
// coordinates instead of opaque strings.
export function encodePolyline(points: LatLng[]): string {
  let lastLat = 0;
  let lastLng = 0;
  let out = '';
  for (const { lat, lng } of points) {
    const latE5 = Math.round(lat * 1e5);
    const lngE5 = Math.round(lng * 1e5);
    out += encodeValue(latE5 - lastLat) + encodeValue(lngE5 - lastLng);
    lastLat = latE5;
    lastLng = lngE5;
  }
  return out;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let out = '';
  while (v >= 0x20) {
    out += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
    v >>= 5;
  }
  return out + String.fromCharCode(v + 63);
}

/** A straight line of `count` points from `from` to `to`. */
export function line(from: LatLng, to: LatLng, count = 50): LatLng[] {
  return Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return {
      lat: from.lat + (to.lat - from.lat) * t,
      lng: from.lng + (to.lng - from.lng) * t,
    };
  });
}
