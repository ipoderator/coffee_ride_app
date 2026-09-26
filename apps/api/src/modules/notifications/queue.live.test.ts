import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import {
  WEB_ORIGIN,
  organizerWithDraftRide,
  signUp,
} from '../../test-support/app-fixtures.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-137. The happy path of the Redis-backed queue against a real Redis:
// `queue.test.ts` mocks ioredis/BullMQ, and `degraded-dependencies.test.ts`
// only covers Redis being down. Guards the fail-fast producer options
// (`enableOfflineQueue: false`, `commandTimeout`) against breaking normal
// delivery. Opt-in like the live S3 tests: CI's `redis` service sets
// RUN_LIVE_REDIS_TESTS=1; locally `docker compose up -d` plus that variable
// (and `.env.example`'s REDIS_URL, which carries the dev password).
const redisUrl = process.env.REDIS_URL;
const hasLiveRedis = process.env.RUN_LIVE_REDIS_TESTS === '1' && !!redisUrl;

describe.skipIf(!hasLiveRedis)(
  'notification queue against a live Redis',
  () => {
    let app: Awaited<ReturnType<typeof buildApp>>;

    beforeAll(async () => {
      app = await buildApp(
        loadEnv({
          NODE_ENV: 'test',
          AUTH_SECRET: 'a-test-only-secret',
          DATABASE_URL: getTestDatabaseUrl(),
          WEB_ORIGIN,
          REDIS_URL: redisUrl,
          // Rate-limit counters live in this real Redis and outlast a run.
          RATE_LIMIT_MAX: '10000',
          AUTH_RATE_LIMIT_MAX: '10000',
        }),
      );
      await app.db.execute(sql`DELETE FROM rides`);
      await app.db.execute(sql`DELETE FROM users`);
      // onReady waits for the producer connection (queue.ts).
      await app.ready();
      expect(app.redis?.status).toBe('ready');
    });

    afterAll(async () => {
      await app.db.execute(sql`DELETE FROM rides`);
      await app.db.execute(sql`DELETE FROM users`);
      await app.close();
    });

    it('/health reports redis=ok', async () => {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.json().dependencies.redis).toBe('ok');
    });

    it('a registration reaches the rider inbox through the queue and worker', async () => {
      const { rawToken, rideId } = await organizerWithDraftRide(app);
      for (const action of ['publish', 'open-registration']) {
        const response = await app.inject({
          method: 'POST',
          url: `/v1/rides/${rideId}/${action}`,
          headers: { origin: WEB_ORIGIN },
          cookies: { session: rawToken },
        });
        expect(response.statusCode).toBe(200);
      }
      const rider = await signUp(app);

      const registered = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rider },
      });
      expect(registered.statusCode).toBe(201);

      // Delivered asynchronously by the in-process worker.
      let types: string[] = [];
      for (let i = 0; i < 50 && types.length === 0; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const inbox = await app.inject({
          method: 'GET',
          url: '/v1/notifications/mine',
          cookies: { session: rider },
        });
        types = inbox.json().items.map((item: { type: string }) => item.type);
      }
      expect(types).toEqual(['registration_confirmed']);
    });
  },
);
