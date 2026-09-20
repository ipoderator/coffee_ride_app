import sharp from 'sharp';

// ADR-019 (CR-086), relocated to `lib/` (CR-097/KI-023) once a second and third
// caller (`users`, `organizers` avatars) joined the original `rides` cover-image
// caller — a shared, non-domain image pipeline belongs alongside `lib/cursor.ts`/
// `lib/account-rate-limit.ts`, not inside one capability module the others would
// then have to reach into (`.claude/rules/resilience.md`'s module-boundary rule).
// Accepted formats verified by decoding the actual bytes with `sharp`, never by
// trusting the client's `Content-Type`/filename (`.claude/rules/security.md`). SVG
// deliberately excluded — a known image-upload XSS vector (embedded
// `<script>`/`foreignObject`), not something a raster photo needs. Maps `sharp`'s
// detected format string to the extension the S3 key/`Content-Type` use.
const ACCEPTED_FORMATS: Record<string, { contentType: string; ext: string }> = {
  jpeg: { contentType: 'image/jpeg', ext: 'jpg' },
  png: { contentType: 'image/png', ext: 'png' },
  webp: { contentType: 'image/webp', ext: 'webp' },
};

// ADR-019: bounds storage/bandwidth without upscaling a smaller image. Resize
// only, never crop — `docs/design.md` §14 leaves cover-image (and, per CR-097, the
// same still-open question for an avatar) aspect ratio/crop behavior open;
// consumers crop to their own container via CSS `object-cover`, independent of the
// stored image's ratio.
const MAX_DIMENSION_PX = 1920;

export class ImageInvalidError extends Error {}

export interface ProcessedImage {
  buffer: Buffer;
  contentType: string;
  ext: string;
}

/**
 * ADR-019: validates the upload is a real JPEG/PNG/WebP (by decoding it, not by
 * trusting client-supplied metadata), then resizes it to fit within
 * {@link MAX_DIMENSION_PX} and strips metadata. `.rotate()` with no argument
 * bakes in the EXIF orientation tag before `sharp` discards the rest of the
 * EXIF block (including any GPS tag a phone photo commonly carries) — a
 * deliberate privacy side effect of the re-encode, not just a size cap.
 */
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new ImageInvalidError(
      'The uploaded file could not be read as an image.',
    );
  }

  const format = ACCEPTED_FORMATS[metadata.format];
  if (!format) {
    throw new ImageInvalidError('Only JPEG, PNG, or WebP images are accepted.');
  }

  const resized = await sharp(buffer)
    .rotate()
    .resize({
      width: MAX_DIMENSION_PX,
      height: MAX_DIMENSION_PX,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toFormat(metadata.format)
    .toBuffer();

  return { buffer: resized, contentType: format.contentType, ext: format.ext };
}
