import type { FastifyRequest } from 'fastify';

// CR-097: extracted from `rides.routes.ts`'s `readGpxUpload`/`readCoverImageUpload`
// once a third and fourth call site (user/organizer avatar routes) needed the same
// "read the one multipart file field into a buffer, map @fastify/multipart's
// too-large error to a generic marker" shape. `rides.routes.ts` keeps its own two
// copies rather than being refactored onto this as part of this change — lower
// risk than touching already-shipped GPX/cover-image upload paths for a
// same-behavior rename.
export class UploadTooLargeError extends Error {}

export async function readUploadedFile(
  request: FastifyRequest,
  maxBytes: number,
): Promise<{ buffer: Buffer } | null> {
  const part = await request.file({ limits: { fileSize: maxBytes } });
  if (!part) {
    return null;
  }
  try {
    return { buffer: await part.toBuffer() };
  } catch (err) {
    if (
      err instanceof Error &&
      (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      throw new UploadTooLargeError();
    }
    throw err;
  }
}
