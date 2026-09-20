import sharp from 'sharp';

// ADR-019 (CR-086): accepted formats verified by decoding the actual bytes with
// `sharp`, never by trusting the client's `Content-Type`/filename
// (`.claude/rules/security.md`). SVG deliberately excluded — a known
// image-upload XSS vector (embedded `<script>`/`foreignObject`), not something a
// raster cover photo needs. Maps `sharp`'s detected format string to the
// extension the S3 key/`Content-Type` use.
const ACCEPTED_FORMATS: Record<string, { contentType: string; ext: string }> = {
  jpeg: { contentType: 'image/jpeg', ext: 'jpg' },
  png: { contentType: 'image/png', ext: 'png' },
  webp: { contentType: 'image/webp', ext: 'webp' },
};

// ADR-019: bounds storage/bandwidth without upscaling a smaller image. Resize
// only, never crop — `docs/design.md` §14 leaves cover-image aspect ratio/crop
// behavior open; `RideCard`/`RideDetailView` already crop to their own
// container via CSS `object-cover`, independent of the stored image's ratio.
const MAX_DIMENSION_PX = 1920;

export class CoverImageInvalidError extends Error {}

export interface ProcessedCoverImage {
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
export async function processCoverImage(
  buffer: Buffer,
): Promise<ProcessedCoverImage> {
  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    metadata = await sharp(buffer).metadata();
  } catch {
    throw new CoverImageInvalidError(
      'The uploaded file could not be read as an image.',
    );
  }

  const format = ACCEPTED_FORMATS[metadata.format];
  if (!format) {
    throw new CoverImageInvalidError(
      'Only JPEG, PNG, or WebP images are accepted.',
    );
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
