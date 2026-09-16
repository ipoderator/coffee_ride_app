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

// `.claude/rules/resilience.md`: every external call needs an explicit timeout, a
// bounded retry (idempotent operations only), and a circuit breaker. CR-049's shared
// `resilience` package (`packages/resilience`) provides all three; this module just
// wires them up — PUT/GET/DELETE by key are idempotent, so a retry is safe, and one
// breaker shared across all three tracks "is S3 degraded" as a whole, not per call.
const TIMEOUT_MS = 8000;
const MAX_ATTEMPTS = 2; // 1 initial + 1 retry.
const BREAKER_FAILURE_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 30_000;

const breaker = new CircuitBreaker({
  failureThreshold: BREAKER_FAILURE_THRESHOLD,
  cooldownMs: BREAKER_COOLDOWN_MS,
});

export class RouteStorageError extends Error {}

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
      throw new RouteStorageError(
        error.code === 'circuit_open'
          ? 'S3 is temporarily unavailable (circuit open).'
          : `S3 route-storage operation failed: ${error.message}`,
      );
    }
    throw error;
  }
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
