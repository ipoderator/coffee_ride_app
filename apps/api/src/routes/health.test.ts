import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDatabaseUrl } from '../test-support/test-database-url.js';

// Same "mock the SDK wire call, exercise the real wiring code" technique as
// `route.routes.test.ts` (S3) and `queue.test.ts` (bullmq/ioredis) — this suite
// runs with no live Postgres-adjacent infra beyond the real local Postgres every
// `apps/api` test already requires (KI-014/KI-015/KI-019, Docker unreachable in
// this environment).
const s3SendMock = vi.fn();
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  class MockS3Client {
    send(...args: unknown[]) {
      return s3SendMock(...args);
    }
  }
  return { ...actual, S3Client: MockS3Client };
});

const redisPingMock = vi.fn();
vi.mock('ioredis', () => {
  class MockRedis {
    on() {
      return this;
    }
    disconnect() {}
    ping(...args: unknown[]) {
      return redisPingMock(...args);
    }
    // CR-058: `app.ts`'s global rate-limit registration now passes `app.redis`
    // into `@fastify/rate-limit`'s `RedisStore`, which every request (`/health`
    // included) goes through. `RedisStore` only calls `defineCommand` when
    // `rateLimit`/`rateLimitRead` don't already exist on the client — predefining
    // both here (always "first hit, never limited") means this suite, which has
    // nothing to do with rate limiting, never needs to fake ioredis's dynamic
    // `defineCommand` machinery at all.
    rateLimit(
      _key: string,
      timeWindow: number,
      _max: number,
      _continueExceeding: boolean,
      _exponentialBackoff: boolean,
      cb: (err: Error | null, result: [number, number]) => void,
    ) {
      cb(null, [1, timeWindow]);
    }
    rateLimitRead(
      _key: string,
      cb: (err: Error | null, result: [number, number]) => void,
    ) {
      cb(null, [0, 0]);
    }
  }
  return { Redis: MockRedis };
});

vi.mock('bullmq', () => {
  class MockQueue {
    on() {
      return this;
    }
    add() {
      return Promise.resolve();
    }
    close() {
      return Promise.resolve();
    }
  }
  class MockWorker {
    on() {
      return this;
    }
    close() {
      return Promise.resolve();
    }
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

const { buildApp } = await import('../app.js');
const { loadEnv } = await import('../env.js');

const DATABASE_URL = getTestDatabaseUrl();

const WEB_ORIGIN = 'http://localhost:3000';

const envWithoutRedisOrS3 = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
  WEB_ORIGIN,
});

const envWithRedisAndS3 = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
  WEB_ORIGIN,
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_BUCKET: 'coffee-ride-test',
});

const envWithUnreachableDb = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: 'postgresql://localhost:59999/does-not-exist',
  WEB_ORIGIN,
});

describe('GET /health', () => {
  beforeEach(() => {
    s3SendMock.mockReset();
    redisPingMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports not_configured for redis/s3 and ok overall when neither is set up', async () => {
    const app = await buildApp(envWithoutRedisOrS3);
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ok',
        dependencies: {
          db: 'ok',
          redis: 'not_configured',
          s3: 'not_configured',
        },
      });
    } finally {
      await app.close();
    }
  });

  it('reports ok across db/redis/s3 when all three are healthy', async () => {
    redisPingMock.mockResolvedValue('PONG');
    s3SendMock.mockResolvedValue({});

    const app = await buildApp(envWithRedisAndS3);
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'ok',
        dependencies: { db: 'ok', redis: 'ok', s3: 'ok' },
      });
      expect(s3SendMock).toHaveBeenCalledWith(
        expect.any(HeadBucketCommand),
        expect.objectContaining({ abortSignal: expect.any(AbortSignal) }),
      );
    } finally {
      await app.close();
    }
  });

  it('reports degraded when the Redis ping fails, without affecting db/s3', async () => {
    redisPingMock.mockRejectedValue(new Error('connection unavailable'));
    s3SendMock.mockResolvedValue({});

    const app = await buildApp(envWithRedisAndS3);
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'degraded',
        dependencies: { db: 'ok', redis: 'error', s3: 'ok' },
      });
    } finally {
      await app.close();
    }
  });

  it('reports degraded when the S3 HeadBucket check fails', async () => {
    redisPingMock.mockResolvedValue('PONG');
    s3SendMock.mockRejectedValue(new Error('bucket unreachable'));

    const app = await buildApp(envWithRedisAndS3);
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'degraded',
        dependencies: { db: 'ok', redis: 'ok', s3: 'error' },
      });
    } finally {
      await app.close();
    }
  });

  it('reports degraded (never a 500) when the database is unreachable', async () => {
    const app = await buildApp(envWithUnreachableDb);
    try {
      const response = await app.inject({ method: 'GET', url: '/health' });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('degraded');
      expect(body.dependencies.db).toBe('error');
    } finally {
      await app.close();
    }
  });
});
