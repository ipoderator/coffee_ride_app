import { createHash } from 'node:crypto';
import { z } from 'zod';

// CR-217 (KI-094): a cover/avatar is served at a path derived from an id alone, so
// without a version a replaced or deleted image stayed in every cache for a year.
// Each upload gets a fresh random object key, so a short hash of the key changes
// exactly when the image does; the key itself never leaves the API (ADR-019).
export function imageVersion(objectKey: string): string {
  return createHash('sha256')
    .update(objectKey)
    .digest('base64url')
    .slice(0, 16);
}

export function versionedImagePath(path: string, objectKey: string): string {
  return `${path}?v=${imageVersion(objectKey)}`;
}

export const imageVersionQuerySchema = z.object({
  v: z.string().max(64).optional(),
});

// `immutable` only for the URL that names the current image — any other version
// (stale, missing, guessed) revalidates, so it can't pin the current bytes under a
// URL that won't change on the next replace.
export function imageCacheControl(
  objectKey: string,
  requestedVersion: string | undefined,
  visibility: 'public' | 'private',
): string {
  return requestedVersion === imageVersion(objectKey)
    ? `${visibility}, max-age=31536000, immutable`
    : `${visibility}, no-cache`;
}
