import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { callWithResilience } from 'resilience';
import { raceTimeout } from '../lib/race-timeout.js';
import type { S3Handle } from '../plugins/s3.js';
import type { RedisClient } from '../redis.js';
import type { DbClient } from 'db';

// `.claude/rules/resilience.md`: "apps/api exposes a health check endpoint that
// reports the status of its own dependencies (DB, Redis, S3) without dying if one
// is degraded." GET /health — unversioned by design (ADR-011, docs/api.md).
//
// `not_configured` is deliberately distinct from `error`: an optional dependency
// that was never wired up (Redis/S3 in this environment — KI-014/KI-015) is an
// expected degraded mode, not a failure to alert on. `db` has no `not_configured`
// state — `DATABASE_URL` is required, so its absence is a boot-time env-validation
// error, never something this route observes.
const dependencyStatusSchema = z.enum(['ok', 'error', 'not_configured']);

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  dependencies: z.object({
    db: dependencyStatusSchema,
    redis: dependencyStatusSchema,
    s3: dependencyStatusSchema,
  }),
});

type DependencyStatus = z.infer<typeof dependencyStatusSchema>;

// Short and uniform across the three checks — this endpoint is a diagnostic
// liveness probe, not a business operation: it must resolve fast regardless of
// which dependency is stuck, so a caller (deploy platform, uptime monitor) never
// waits long for an answer.
const DB_TIMEOUT_MS = 2000;
const REDIS_TIMEOUT_MS = 1500;
const S3_TIMEOUT_MS = 2000;

// Neither postgres.js nor ioredis commands accept an `AbortSignal` — same gotcha
// `modules/notifications/queue.ts` already documented for BullMQ. `raceTimeout`
// (extracted from that module) is the only thing that actually bounds these.
async function checkDb(db: DbClient): Promise<DependencyStatus> {
  try {
    await raceTimeout(
      db.execute(sql`select 1`),
      DB_TIMEOUT_MS,
      `Database health check timed out after ${DB_TIMEOUT_MS}ms.`,
    );
    return 'ok';
  } catch {
    return 'error';
  }
}

async function checkRedis(
  redis: RedisClient | null,
): Promise<DependencyStatus> {
  if (!redis) return 'not_configured';
  try {
    await raceTimeout(
      redis.ping(),
      REDIS_TIMEOUT_MS,
      `Redis health check timed out after ${REDIS_TIMEOUT_MS}ms.`,
    );
    return 'ok';
  } catch {
    return 'error';
  }
}

// Unlike DB/Redis, the AWS SDK honors `abortSignal` — `callWithResilience`'s
// timeout is a real enforcement here, not just a label. No retry/breaker: this is
// a diagnostic ping, not a retried business operation, and it must not share
// `route-storage.ts`'s upload/download/delete breaker (a health-check failure
// shouldn't trip the breaker guarding real traffic, and vice versa).
async function checkS3(s3: S3Handle | null): Promise<DependencyStatus> {
  if (!s3) return 'not_configured';
  try {
    await callWithResilience(
      (signal) =>
        s3.client.send(new HeadBucketCommand({ Bucket: s3.bucket }), {
          abortSignal: signal,
        }),
      { timeoutMs: S3_TIMEOUT_MS },
    );
    return 'ok';
  } catch {
    return 'error';
  }
}

// This is a bootstrap-only stub: no DB/Redis/S3 dependency checks. CR-051
// ("Health check endpoint reporting DB/Redis/S3 status") replaces the handler
// body with real checks — same route, same unversioned contract position,
// still must not fail hard if one dependency is degraded.
export async function healthRoutes(app: FastifyInstance) {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: healthResponseSchema,
        },
      },
    },
    async () => {
      const [db, redis, s3] = await Promise.all([
        checkDb(app.db),
        checkRedis(app.redis),
        checkS3(app.s3),
      ]);

      const status =
        db === 'error' || redis === 'error' || s3 === 'error'
          ? ('degraded' as const)
          : ('ok' as const);

      return { status, dependencies: { db, redis, s3 } };
    },
  );
}
