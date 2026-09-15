import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import type { S3Handle } from '../../plugins/s3.js';

// `.claude/rules/resilience.md`: every external call needs an explicit timeout, a
// bounded retry (idempotent operations only), and a defined fallback. CR-049 (the
// shared timeout/retry/circuit-breaker utility for every external integration) isn't
// built yet, so this is a small wrapper scoped to this module — the first real S3
// consumer — not a new shared package (`.claude/context/current-task.md`'s scoping
// note: generalize into CR-049 once a second consumer needs the same shape).
const TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 2; // 1 initial + 1 retry — PUT/GET/DELETE by key are idempotent.

export class RouteStorageError extends Error {}

async function withResilience<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await operation(controller.signal);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new RouteStorageError(
    `S3 route-storage operation failed after ${MAX_ATTEMPTS} attempt(s): ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

function requireS3(s3: S3Handle | null): S3Handle {
  if (!s3) {
    throw new RouteStorageError('S3 is not configured in this environment.');
  }
  return s3;
}

export async function uploadGpxObject(
  s3: S3Handle | null,
  key: string,
  body: Buffer,
): Promise<void> {
  const handle = requireS3(s3);
  await withResilience((signal) =>
    handle.client.send(
      new PutObjectCommand({
        Bucket: handle.bucket,
        Key: key,
        Body: body,
        ContentType: 'application/gpx+xml',
      }),
      { abortSignal: signal },
    ),
  );
}

export async function downloadGpxObject(
  s3: S3Handle | null,
  key: string,
): Promise<{ body: Buffer; contentType: string | undefined }> {
  const handle = requireS3(s3);
  return withResilience(async (signal) => {
    const result = await handle.client.send(
      new GetObjectCommand({ Bucket: handle.bucket, Key: key }),
      { abortSignal: signal },
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) {
      throw new RouteStorageError('S3 object body was empty.');
    }
    return { body: Buffer.from(bytes), contentType: result.ContentType };
  });
}

// Best-effort: `.claude/rules/resilience.md`'s "never let an external integration's
// failure ... block" the primary action — the DB row is the source of truth for
// whether a route exists, so a delete failure here is logged by the caller, not
// re-thrown to block the DB delete that already committed.
export async function deleteGpxObject(
  s3: S3Handle | null,
  key: string,
): Promise<void> {
  const handle = requireS3(s3);
  await withResilience((signal) =>
    handle.client.send(
      new DeleteObjectCommand({ Bucket: handle.bucket, Key: key }),
      { abortSignal: signal },
    ),
  );
}
