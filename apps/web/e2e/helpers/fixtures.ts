// CR-138. In-memory upload fixtures for `page.setInputFiles`, matching the
// existing convention of generating fixture bytes rather than committing
// binaries (`apps/api/src/test-support/app-fixtures.ts`'s `gpxTrack`/
// `multipartFile`). `apps/api`'s image pipeline (`lib/image-processing.ts`)
// decodes the actual bytes with `sharp` and ignores the declared filename/
// `Content-Type` — a real image buffer works for avatar and cover uploads
// alike, whatever name/mimetype is attached to it here.

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

/** A minimal, real GPX track — same shape as `app-fixtures.ts`'s `gpxTrack`. */
export function sampleGpxFile(
  points: Array<[lat: number, lng: number]> = [
    [55.75, 37.6],
    [55.76, 37.62],
    [55.77, 37.64],
  ],
): UploadFile {
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<gpx version="1.1" creator="e2e"><trk><trkseg>' +
    points
      .map(
        ([lat, lng]) =>
          `<trkpt lat="${lat}" lon="${lng}"><ele>100</ele></trkpt>`,
      )
      .join('') +
    '</trkseg></trk></gpx>';
  return {
    name: 'route.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from(xml, 'utf-8'),
  };
}

/** Not valid GPX — for asserting the client's `gpx_invalid` handling against
 * the real API rather than a mocked one. */
export function malformedGpxFile(): UploadFile {
  return {
    name: 'broken.gpx',
    mimeType: 'application/gpx+xml',
    buffer: Buffer.from('this is not xml', 'utf-8'),
  };
}

// The smallest possible real PNG (1x1, transparent) — decodes fine with
// `sharp`, so it clears `apps/api`'s "is this actually an image" check.
const MINIMAL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function sampleImageFile(name = 'photo.png'): UploadFile {
  return {
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(MINIMAL_PNG_BASE64, 'base64'),
  };
}

/** Not a real image — for the real `*_invalid` error path. */
export function malformedImageFile(): UploadFile {
  return {
    name: 'not-a-photo.png',
    mimeType: 'image/png',
    buffer: Buffer.from('this is not an image', 'utf-8'),
  };
}
