import type { FastifyInstance } from 'fastify';
import { Queue, Worker, type Job } from 'bullmq';
import { CircuitBreaker } from 'resilience';
import { createRedisClient, type RedisClient } from '../../redis.js';
import { raceTimeout } from '../../lib/race-timeout.js';
import type { Env } from '../../env.js';
import {
  processNotificationJob,
  type NotificationJobData,
  type NotificationJobName,
  type NotificationQueue,
} from './notifications.service.js';

export type { NotificationQueue } from './notifications.service.js';

declare module 'fastify' {
  interface FastifyInstance {
    // `null` when `REDIS_URL` isn't configured — same "not configured is a
    // degraded mode, never a boot-time crash" pattern as `app.s3`
    // (`plugins/s3.ts`, KI-015). Every notification producer
    // (`notifications.service.ts`) treats `null` as "fall back to a direct
    // synchronous insert", so the app works identically with or without Redis
    // (this environment — KI-014, Docker unreachable, never live-verified).
    notificationQueue: NotificationQueue | null;
    // The same producer connection `notificationQueue` uses, exposed
    // separately for CR-051's health check (`routes/health.ts`) — a `PING` is
    // a connection-liveness check, not a queue operation, and reusing this
    // connection avoids opening a fourth Redis connection just to ping.
    redis: RedisClient | null;
  }
}

const QUEUE_NAME = 'notifications';

// Bounded retry + backoff, not infinite — a job that keeps failing (e.g. a bad
// rideId) shouldn't hammer Postgres forever. Final failure is logged by the
// worker's own `failed` handler below (`.claude/rules/resilience.md`: a
// background job failure must never silently disappear).
const JOB_ATTEMPTS = 3;
const JOB_BACKOFF_DELAY_MS = 2000;

// `callWithResilience`'s `timeoutMs` only bounds an operation that itself honors
// the `AbortSignal` it's handed (like `fetch`/the AWS SDK's `abortSignal` option
// — see `route-storage.ts`) — BullMQ's `Queue.add()` accepts no such signal.
// Confirmed live (not just reasoned about): against a genuinely unreachable
// Redis, `queue.add()` does not reject on its own within any bounded time —
// it awaits BullMQ's internal `waitUntilReady()`, which keeps waiting for a
// `ready` event that ioredis's default (intentionally infinite, so a real
// production outage self-heals without a restart) reconnect strategy never
// stops trying to produce. `redis.ts`'s `maxRetriesPerRequest: 3` does not
// help here either — it bounds a *command already queued on an established
// connection*, not the initial `waitUntilReady()` wait. So `raceTimeout`
// below wraps the call in a real `Promise.race` against a plain timer — the
// only mechanism that actually bounds it — while the underlying connection
// keeps retrying in the background (harmless: nothing awaits it once this
// call has already timed out). A `CircuitBreaker` then short-circuits every
// call after repeated failures, so a sustained outage doesn't tax every
// single request with the same timeout delay — same values `route-storage.ts`
// uses for the identical reasoning.
const ENQUEUE_TIMEOUT_MS = 1500;
const ENQUEUE_BREAKER_FAILURE_THRESHOLD = 5;
const ENQUEUE_BREAKER_COOLDOWN_MS = 30_000;
// Same "graceful close can hang against an unreachable Redis" reasoning as
// `ENQUEUE_TIMEOUT_MS` — see `onClose` below.
const CLOSE_TIMEOUT_MS = 3000;

/**
 * CR-050 ("Async notification delivery via Redis queue"). First real consumer
 * of `redis.ts`'s `createRedisClient` (its own doc comment already named this
 * ticket/BullMQ as the anticipated use). Runs the worker in-process — same
 * Fastify process as the API server, not a second deployable service
 * (`.claude/rules/resilience.md`: "do not introduce a second deployable
 * service 'for resilience' without a new ADR"; ADR-008: modular monolith).
 *
 * Two separate ioredis connections: the producer keeps `redis.ts`'s default
 * bounded `maxRetriesPerRequest: 3` (see the enqueue-timeout comment below);
 * the consumer overrides it to `null`, BullMQ's own requirement for a `Worker`
 * connection, since it issues blocking commands a bounded per-request retry
 * would interrupt. Each gets its own `.on('error', ...)` listener (`redis.ts`'s
 * own doc comment: ioredis throws if an `error` event has no listener) so a
 * degraded Redis logs and never crashes the process.
 */
export function registerNotificationQueue(app: FastifyInstance, env: Env) {
  if (!env.REDIS_URL) {
    app.decorate('notificationQueue', null);
    app.decorate('redis', null);
    return;
  }

  const producerConnection = createRedisClient(env.REDIS_URL);
  producerConnection.on('error', (err) => {
    app.log.error(
      { err },
      'Redis connection error (notification queue producer)',
    );
  });
  app.decorate('redis', producerConnection);

  const consumerConnection = createRedisClient(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  consumerConnection.on('error', (err) => {
    app.log.error(
      { err },
      'Redis connection error (notification queue worker)',
    );
  });

  const enqueueBreaker = new CircuitBreaker({
    failureThreshold: ENQUEUE_BREAKER_FAILURE_THRESHOLD,
    cooldownMs: ENQUEUE_BREAKER_COOLDOWN_MS,
  });

  const queue = new Queue(QUEUE_NAME, { connection: producerConnection });
  queue.on('error', (err) => {
    app.log.error({ err }, 'BullMQ queue error (notifications)');
  });

  const worker = new Worker<NotificationJobData, void, NotificationJobName>(
    QUEUE_NAME,
    async (job: Job<NotificationJobData, void, NotificationJobName>) => {
      await processNotificationJob(app.db, job.name, job.data);
    },
    {
      connection: consumerConnection,
      concurrency: 5,
    },
  );
  worker.on('failed', (job, err) => {
    // CR-079/KI-006: this is the actual "background job failure" resilience.md
    // means — routed through the same funnel an unexpected 500 uses
    // (error-handler.ts), so "must be visible" means the same thing in both
    // places. Deliberately not applied to the connection-level `.on('error',
    // ...)` handlers below — those fire repeatedly on ordinary Redis
    // hiccups and would trip the webhook sink's breaker on transient noise
    // instead of a real job failure.
    app.reportError(err, 'Notification job failed after exhausting retries', {
      jobId: job?.id,
      jobName: job?.name,
      attempts: job?.attemptsMade,
    });
  });
  worker.on('error', (err) => {
    app.log.error({ err }, 'BullMQ worker error (notifications)');
  });

  app.decorate('notificationQueue', {
    async add(name: NotificationJobName, data: NotificationJobData) {
      if (!enqueueBreaker.canAttempt()) {
        throw new Error(
          'Notification queue is temporarily unavailable (circuit open).',
        );
      }
      try {
        await raceTimeout(
          queue.add(name, data, {
            attempts: JOB_ATTEMPTS,
            backoff: { type: 'exponential', delay: JOB_BACKOFF_DELAY_MS },
            removeOnComplete: true,
            // Keep a bounded trail of failed jobs for inspection instead of an
            // unbounded one — mirrors the bounded-retry reasoning above.
            removeOnFail: 200,
          }),
          ENQUEUE_TIMEOUT_MS,
          `Notification enqueue timed out after ${ENQUEUE_TIMEOUT_MS}ms.`,
        );
        enqueueBreaker.recordSuccess();
      } catch (err) {
        enqueueBreaker.recordFailure();
        throw err;
      }
    },
  });

  app.addHook('onClose', async () => {
    // Confirmed live, same as the `add()` hang above: `worker.close()`/
    // `queue.close()` try to shut down gracefully over the (possibly
    // unreachable) Redis connection and can hang the same way — which would
    // hang the whole app's graceful shutdown (`app.close()`, e.g. on SIGTERM)
    // if Redis happens to be down at shutdown time. `raceTimeout` bounds each;
    // `disconnect()` (not `quit()`) below is synchronous/immediate either way,
    // so the connections are always torn down even if the graceful close
    // didn't finish in time.
    await raceTimeout(worker.close(), CLOSE_TIMEOUT_MS).catch(
      (err: unknown) => {
        app.log.error({ err }, 'Timed out closing notification worker.');
      },
    );
    await raceTimeout(queue.close(), CLOSE_TIMEOUT_MS).catch((err: unknown) => {
      app.log.error({ err }, 'Timed out closing notification queue.');
    });
    producerConnection.disconnect();
    consumerConnection.disconnect();
  });
}
