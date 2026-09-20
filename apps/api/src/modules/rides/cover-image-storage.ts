import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import {
  CircuitBreaker,
  callWithResilience,
  ResilienceError,
} from 'resilience';
import type { S3Handle } from '../../plugins/s3.js';

// ADR-019 (CR-086): same shape as `route-storage.ts` — a dedicated module (and
// breaker) per S3-backed integration, `.claude/rules/resilience.md`'s "shares one
// CircuitBreaker instance across every call it makes" scoped to this module, not
// shared globally across every S3 consumer. Written generically (a plain
// key/buffer/contentType, no `rides`-specific assumptions) so a future avatar
// upload endpoint (KI-023) can reuse it without rebuilding this wrapper.
const TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 2; // 1 initial + 1 retry.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

const breaker = new CircuitBreaker({
  failureThreshold: BREAKER_FAILURE_THRESHOLD,
  cooldownMs: BREAKER_COOLDOWN_MS,
});

export class CoverImageStorageError extends Error {}

async function withResilience<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  try {
    return await callWithResilience(operation, {
      timeoutMs: TIMEOUT_MS,
      retries: { maxAttempts: MAX_ATTEMPTS },
      breaker,
    });
  } catch (error) {
    if (error instanceof ResilienceError) {
      throw new CoverImageStorageError(
        error.code === 'circuit_open'
          ? 'S3 is temporarily unavailable (circuit open).'
          : `S3 cover-image operation failed: ${error.message}`,
      );
    }
    throw error;
  }
}

function requireS3(s3: S3Handle | null): S3Handle {
  if (!s3) {
    throw new CoverImageStorageError(
      'S3 is not configured in this environment.',
    );
  }
  return s3;
}

export async function uploadCoverImageObject(
  s3: S3Handle | null,
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const handle = requireS3(s3);
  await withResilience((signal) =>
    handle.client.send(
      new PutObjectCommand({
        Bucket: handle.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
      { abortSignal: signal },
    ),
  );
}

export async function downloadCoverImageObject(
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
      throw new CoverImageStorageError('S3 object body was empty.');
    }
    return { body: Buffer.from(bytes), contentType: result.ContentType };
  });
}

// Best-effort — same reasoning as `route-storage.ts`'s `deleteGpxObject`: the DB
// row is the source of truth for whether a cover image exists, so a delete
// failure here is logged by the caller, not re-thrown to block a DB change that
// already committed.
export async function deleteCoverImageObject(
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
