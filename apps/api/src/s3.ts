import { S3Client } from '@aws-sdk/client-s3';

export interface S3ClientConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// Official AWS SDK v3, not MinIO's own client: it speaks the same
// S3-compatible protocol against every provider (AWS S3, MinIO, Cloudflare
// R2, Backblaze B2, ...), and ADR-005 leaves the production provider
// deployment-specific — no reason to couple to MinIO's own SDK.
//
// A factory, not a singleton reading `process.env` itself (same shape as
// packages/db's `createDbClient` and this package's own `createRedisClient`):
// the caller owns env validation and passes in already-validated config.
//
// Not wired into any route/use case yet — the first real consumer (GPX
// upload, CR-027; cover images, CR-086) also decides direct-S3-vs-proxy
// serving and applies the resilience wrapping from CR-049 (timeout, bounded
// retry for idempotent operations, circuit breaker, "upload unavailable"
// fallback per `.claude/rules/resilience.md`) at the call site.
export function createS3Client(config: S3ClientConfig) {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    // Required for MinIO and most non-AWS S3-compatible providers:
    // virtual-hosted-style bucket URLs (bucket.endpoint.com) don't resolve
    // against them the way they do against real AWS S3.
    forcePathStyle: true,
  });
}
