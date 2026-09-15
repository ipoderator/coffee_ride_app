import type { FastifyInstance } from 'fastify';
import { createS3Client } from '../s3.js';
import type { Env } from '../env.js';

export interface S3Handle {
  client: ReturnType<typeof createS3Client>;
  bucket: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    // `null` when S3 isn't configured (every `S3_*` env var is optional —
    // `env.ts`'s own comment: "no consumer yet" until this ticket). Route/
    // cover-image code treats "not configured" the same as "the call failed":
    // a degraded-storage response (`.claude/rules/resilience.md`), never a
    // boot-time crash — mirrors `redis.ts`/`s3.ts` being unverified-but-optional
    // (KI-014/KI-015) rather than required infrastructure.
    s3: S3Handle | null;
  }
}

// First real consumer of `createS3Client` (CR-027, KI-015). Mirrors
// `registerDb`'s decorate-from-validated-env shape; unlike `registerDb`, a
// missing/incomplete S3 config is not a startup error — it decorates `null`,
// and callers (`route-storage.ts`) turn that into the same degraded
// `route_storage_unavailable` response a live connection failure would
// produce, so "S3 not configured in this environment" and "S3 configured but
// unreachable" are indistinguishable to API consumers — both are the
// documented degraded state, never a 500.
export function registerS3(app: FastifyInstance, env: Env) {
  if (
    env.S3_ENDPOINT &&
    env.S3_REGION &&
    env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY &&
    env.S3_BUCKET
  ) {
    const client = createS3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
    app.decorate('s3', { client, bucket: env.S3_BUCKET });
  } else {
    app.decorate('s3', null);
  }
}
