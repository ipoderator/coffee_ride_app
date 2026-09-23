import sax from 'sax';

// ADR-015 (CR-085): a streaming SAX parser, not a full-DOM parse — processes the
// buffered upload incrementally instead of building a parse tree proportional to
// file size, so this stays bounded work even without a worker thread. The caller
// (`rides.routes.ts`) enforces the hard upload size cap (`@fastify/multipart`'s
// `limits.fileSize`) that actually bounds worst-case synchronous work; this module
// only needs to avoid doing *more* work than one pass over the bytes.

export interface RouteGeometryPoint {
  lat: number;
  lng: number;
  elevationMeters: number | null;
}

export interface ParsedGpx {
  geometry: RouteGeometryPoint[];
  distanceKm: number;
  elevationGainMeters: number;
  pointCount: number;
}

export class GpxParseError extends Error {}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

// Haversine great-circle distance between two points, in meters.
function haversineMeters(a: RouteGeometryPoint, b: RouteGeometryPoint): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Parses a GPX file's `trk > trkseg > trkpt` points into ordered geometry plus
 * computed distance/elevation-gain metrics. Rejects (`GpxParseError`) a file with no
 * track points — not a valid route.
 */
export function parseGpx(xml: string): ParsedGpx {
  const parser = sax.parser(true, { trim: true, lowercase: true });
  const geometry: RouteGeometryPoint[] = [];

  let inTrkpt = false;
  let inEle = false;
  let currentLat: number | null = null;
  let currentLng: number | null = null;
  let currentEleText = '';
  let parseError: Error | null = null;

  parser.onerror = (err) => {
    parseError = err;
  };

  parser.onopentag = (node) => {
    if (node.name === 'trkpt') {
      const lat = Number(node.attributes.lat);
      const lng = Number(node.attributes.lon);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        parseError = new GpxParseError(
          'trkpt is missing a valid lat/lon attribute.',
        );
        return;
      }
      inTrkpt = true;
      currentLat = lat;
      currentLng = lng;
      currentEleText = '';
    } else if (inTrkpt && node.name === 'ele') {
      inEle = true;
      currentEleText = '';
    }
  };

  parser.ontext = (text) => {
    if (inEle) {
      currentEleText += text;
    }
  };

  parser.onclosetag = (name) => {
    if (name === 'ele') {
      inEle = false;
    } else if (name === 'trkpt') {
      if (currentLat !== null && currentLng !== null) {
        const elevation = currentEleText.trim()
          ? Number(currentEleText.trim())
          : null;
        geometry.push({
          lat: currentLat,
          lng: currentLng,
          elevationMeters:
            elevation !== null && !Number.isNaN(elevation) ? elevation : null,
        });
      }
      inTrkpt = false;
      currentLat = null;
      currentLng = null;
      currentEleText = '';
    }
  };

  // sax throws synchronously from `write()` on a strict-mode parse error unless the
  // `onerror` handler calls `resume()` — this parser deliberately does not resume (an
  // invalid GPX file should stop parsing, not skip past the bad token), so both the
  // thrown-from-`write()` path and the `onerror`-captured path are handled below.
  try {
    parser.write(xml).close();
  } catch (err) {
    parseError = parseError ?? (err as Error);
  }

  if (parseError) {
    throw new GpxParseError(
      `Malformed GPX file: ${(parseError as Error).message}`,
    );
  }
  if (geometry.length === 0) {
    throw new GpxParseError('GPX file has no track points (trk/trkseg/trkpt).');
  }

  let distanceMeters = 0;
  let elevationGainMeters = 0;
  for (let i = 1; i < geometry.length; i++) {
    const prev = geometry[i - 1]!;
    const curr = geometry[i]!;
    distanceMeters += haversineMeters(prev, curr);
    if (prev.elevationMeters !== null && curr.elevationMeters !== null) {
      const delta = curr.elevationMeters - prev.elevationMeters;
      if (delta > 0) {
        elevationGainMeters += delta;
      }
    }
  }

  return {
    geometry,
    distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    elevationGainMeters: Math.round(elevationGainMeters),
    pointCount: geometry.length,
  };
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * CR-114 ("Route builder"): the inverse of {@link parseGpx}, for a route built
 * from waypoints rather than uploaded — so a built route is stored, downloaded
 * and measured exactly like an uploaded one. A point without an elevation gets
 * no `<ele>`, which `parseGpx` reads back as `null`.
 */
export function serializeGpx(
  name: string,
  points: Array<{ lat: number; lng: number; elevationMeters?: number | null }>,
): string {
  const trackPoints = points
    .map((point) => {
      const ele =
        point.elevationMeters === undefined || point.elevationMeters === null
          ? ''
          : `<ele>${point.elevationMeters}</ele>`;
      return `<trkpt lat="${point.lat}" lon="${point.lng}">${ele}</trkpt>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<gpx version="1.1" creator="Coffee Ride" xmlns="http://www.topografix.com/GPX/1/1">' +
    `<trk><name>${escapeXml(name)}</name><trkseg>${trackPoints}</trkseg></trk>` +
    '</gpx>'
  );
}
