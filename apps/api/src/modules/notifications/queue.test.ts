import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

// CR-050: mocks `bullmq`'s `Queue`/`Worker` and `ioredis`'s `Redis` — same "mock the
// SDK, exercise the real wiring code" technique `route.routes.test.ts` uses for
// `@aws-sdk/client-s3` — so this suite runs with no live Redis (KI-014, Docker
// unreachable in this environment) while still exercising `registerNotificationQueue`
// for real.
const queueAddMock = vi.fn();
const queueCloseMock = vi.fn();
const workerCloseMock = vi.fn();
let capturedProcessor:
  ((job: { name: string; data: unknown }) => Promise<void>) | undefined;

vi.mock('bullmq', () => {
  class MockQueue {
    on() {
      return this;
    }
    add(...args: unknown[]) {
      return queueAddMock(...args);
    }
    close() {
      return queueCloseMock();
    }
  }
  class MockWorker {
    constructor(
      _name: string,
      processor: (job: { name: string; data: unknown }) => Promise<void>,
    ) {
      capturedProcessor = processor;
    }
    on() {
      return this;
    }
    close() {
      return workerCloseMock();
    }
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

const redisDisconnectMock = vi.fn();
vi.mock('ioredis', () => {
  class MockRedis {
    on() {
      return this;
    }
    disconnect() {
      return redisDisconnectMock();
    }
  }
  return { Redis: MockRedis };
});

const processNotificationJobMock = vi.fn();
vi.mock('./notifications.service.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./notifications.service.js')>();
  return { ...actual, processNotificationJob: processNotificationJobMock };
});

const { registerNotificationQueue } = await import('./queue.js');
const { loadEnv } = await import('../../env.js');

const BASE_ENV_SOURCE = {
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: 'postgresql://localhost:5432/does-not-matter-for-this-test',
  WEB_ORIGIN: 'http://localhost:3000',
};

function createFakeApp() {
  const decorations: Record<string, unknown> = {};
  const closeHooks: Array<() => Promise<void>> = [];
  const app = {
    decorate(name: string, value: unknown) {
      decorations[name] = value;
      (app as unknown as Record<string, unknown>)[name] = value;
    },
    addHook(name: string, fn: () => Promise<void>) {
      if (name === 'onClose') closeHooks.push(fn);
    },
    log: { error: vi.fn() },
    db: { marker: 'fake-db' },
    _closeHooks: closeHooks,
  };
  return app as unknown as FastifyInstance & {
    notificationQueue: unknown;
    _closeHooks: Array<() => Promise<void>>;
  };
}

describe('registerNotificationQueue', () => {
  beforeEach(() => {
    queueAddMock.mockReset();
    queueAddMock.mockResolvedValue(undefined);
    queueCloseMock.mockReset();
    queueCloseMock.mockResolvedValue(undefined);
    workerCloseMock.mockReset();
    workerCloseMock.mockResolvedValue(undefined);
    redisDisconnectMock.mockReset();
    processNotificationJobMock.mockReset();
    capturedProcessor = undefined;
  });

  it('decorates null when REDIS_URL is not configured', () => {
    const app = createFakeApp();
    const env = loadEnv(BASE_ENV_SOURCE);

    registerNotificationQueue(app, env);

    expect(app.notificationQueue).toBeNull();
    expect(app._closeHooks).toHaveLength(0);
  });

  it('decorates a queue whose add() calls through to BullMQ with bounded retry options', async () => {
    const app = createFakeApp();
    const env = loadEnv({
      ...BASE_ENV_SOURCE,
      REDIS_URL: 'redis://localhost:6379',
    });

    registerNotificationQueue(app, env);

    expect(app.notificationQueue).not.toBeNull();
    await (
      app.notificationQueue as {
        add: (name: string, data: unknown) => Promise<void>;
      }
    ).add('registration_confirmed', { userId: 'u1', rideId: 'r1' });

    expect(queueAddMock).toHaveBeenCalledWith(
      'registration_confirmed',
      { userId: 'u1', rideId: 'r1' },
      expect.objectContaining({
        attempts: expect.any(Number),
        backoff: expect.objectContaining({ type: 'exponential' }),
        removeOnComplete: true,
      }),
    );
  });

  it('wires the worker processor to processNotificationJob with the app db', async () => {
    const app = createFakeApp();
    const env = loadEnv({
      ...BASE_ENV_SOURCE,
      REDIS_URL: 'redis://localhost:6379',
    });

    registerNotificationQueue(app, env);

    expect(capturedProcessor).toBeDefined();
    await capturedProcessor!({
      name: 'ride_cancelled',
      data: { rideId: 'r1' },
    });

    expect(processNotificationJobMock).toHaveBeenCalledWith(
      app.db,
      'ride_cancelled',
      { rideId: 'r1' },
    );
  });

  it('short-circuits enqueue after repeated failures without calling BullMQ again', async () => {
    const app = createFakeApp();
    const env = loadEnv({
      ...BASE_ENV_SOURCE,
      REDIS_URL: 'redis://localhost:6379',
    });
    queueAddMock.mockRejectedValue(new Error('connection unavailable'));

    registerNotificationQueue(app, env);
    const queueHandle = app.notificationQueue as {
      add: (name: string, data: unknown) => Promise<void>;
    };

    // Default failureThreshold is 5 (see queue.ts) — five failing calls trips it.
    for (let i = 0; i < 5; i++) {
      await expect(
        queueHandle.add('registration_confirmed', {
          userId: 'u1',
          rideId: 'r1',
        }),
      ).rejects.toThrow();
    }
    expect(queueAddMock).toHaveBeenCalledTimes(5);

    // The breaker is now open: the next call must fail fast, without reaching
    // BullMQ's add() at all.
    await expect(
      queueHandle.add('registration_confirmed', { userId: 'u1', rideId: 'r1' }),
    ).rejects.toThrow(/circuit open/);
    expect(queueAddMock).toHaveBeenCalledTimes(5);
  });

  it('closes the worker, queue, and both Redis connections on shutdown', async () => {
    const app = createFakeApp();
    const env = loadEnv({
      ...BASE_ENV_SOURCE,
      REDIS_URL: 'redis://localhost:6379',
    });

    registerNotificationQueue(app, env);

    expect(app._closeHooks).toHaveLength(1);
    await app._closeHooks[0]!();

    expect(workerCloseMock).toHaveBeenCalledTimes(1);
    expect(queueCloseMock).toHaveBeenCalledTimes(1);
    expect(redisDisconnectMock).toHaveBeenCalledTimes(2);
  });

  it('still disconnects both Redis connections even if graceful close hangs', async () => {
    // Confirmed live against a genuinely unreachable Redis: BullMQ's own
    // worker.close()/queue.close() can hang exactly like add() does (see the
    // other describe block's comment). onClose must not depend on either
    // ever settling.
    vi.useFakeTimers();
    try {
      workerCloseMock.mockReturnValue(new Promise(() => {})); // never resolves
      queueCloseMock.mockReturnValue(new Promise(() => {})); // never resolves

      const app = createFakeApp();
      const env = loadEnv({
        ...BASE_ENV_SOURCE,
        REDIS_URL: 'redis://localhost:6379',
      });
      registerNotificationQueue(app, env);

      // Two sequential raceTimeout()s (worker.close() then queue.close()),
      // each bounded at 3000ms — advance past both in turn.
      const closePromise = app._closeHooks[0]!();
      await vi.advanceTimersByTimeAsync(3000);
      await vi.advanceTimersByTimeAsync(3000);
      await closePromise;

      expect(redisDisconnectMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
