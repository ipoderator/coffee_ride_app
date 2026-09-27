import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';
import {
  WEB_ORIGIN,
  gpxTrack,
  multipartFile,
  organizerWithDraftRide,
  signUp,
} from './test-support/app-fixtures.js';
import { getTestDatabaseUrl } from './test-support/test-database-url.js';

// CR-137. S3 or Redis configured but unreachable — the state `GET /health`
// reports as `error`. Nothing is mocked: the endpoints point at a closed
// local port, so every call really fails. Each block checks both halves of
// the contract `apps/web` relies on (it never polls /health — KI-041):
//   - /health says which dependency is down, answers 200 and fast;
//   - the API answers the documented 503 code for the one feature that needs
//     the dependency (the web tests `route.test.tsx`, `cover-image.test.tsx`,
//     `avatar-upload-form.test.tsx` render «Загрузка недоступна» for exactly
//     these codes), and every other journey keeps working
//     (`.claude/rules/resilience.md`).
const CLOSED_PORT_URL = '127.0.0.1:1';
const DATABASE_URL = getTestDatabaseUrl();

const baseEnv = {
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
  WEB_ORIGIN,
};

async function timed<T>(run: () => Promise<T>) {
  const started = performance.now();
  const result = await run();
  return { result, ms: performance.now() - started };
}

async function wipe(app: Awaited<ReturnType<typeof buildApp>>) {
  await app.db.execute(sql`DELETE FROM rides`);
  await app.db.execute(sql`DELETE FROM users`);
}

describe('S3 unreachable', () => {
  const env = loadEnv({
    ...baseEnv,
    S3_ENDPOINT: `http://${CLOSED_PORT_URL}`,
    S3_REGION: 'us-east-1',
    S3_ACCESS_KEY_ID: 'test-access-key',
    S3_SECRET_ACCESS_KEY: 'test-secret-key',
    S3_BUCKET: 'coffee-ride-test',
  });
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(env);
    await wipe(app);
  });

  afterAll(async () => {
    await wipe(app);
    await app.close();
  });

  it('/health reports s3=error and degraded, with 200, within its own timeout', async () => {
    const { result: response, ms } = await timed(() =>
      app.inject({ method: 'GET', url: '/health' }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'degraded',
      dependencies: { db: 'ok', redis: 'not_configured', s3: 'error' },
    });
    expect(ms).toBeLessThan(3000);
  });

  it('GPX upload answers 503 route_storage_unavailable and stores no route', async () => {
    const { rawToken, rideId } = await organizerWithDraftRide(app);
    const upload = multipartFile(
      gpxTrack([
        [55.75, 37.6],
        [55.7545, 37.6],
      ]),
      'route.gpx',
      'application/gpx+xml',
    );

    const response = await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/route`,
      headers: { origin: WEB_ORIGIN, 'content-type': upload.contentType },
      cookies: { session: rawToken },
      payload: upload.body,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('route_storage_unavailable');
    const ride = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}`,
      cookies: { session: rawToken },
    });
    expect(ride.statusCode).toBe(200);
    expect(ride.json().route).toBeNull();
  });

  it('cover upload answers 503 cover_storage_unavailable', async () => {
    const { rawToken, rideId } = await organizerWithDraftRide(app);
    // A tiny valid PNG (1×1) — the image is validated before storage.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64',
    );
    const upload = multipartFile(png, 'cover.png', 'image/png');

    const response = await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/cover`,
      headers: { origin: WEB_ORIGIN, 'content-type': upload.contentType },
      cookies: { session: rawToken },
      payload: upload.body,
    });

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('cover_storage_unavailable');
  });

  it('ride editing and publishing keep working without file storage', async () => {
    const { rawToken, rideId } = await organizerWithDraftRide(app);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: { title: 'Заезд без файлов' },
    });
    const published = await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/publish`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
    });
    const publicRead = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}`,
    });

    expect(patched.statusCode).toBe(200);
    expect(published.statusCode).toBe(200);
    expect(publicRead.statusCode).toBe(200);
    expect(publicRead.json().ride.title).toBe('Заезд без файлов');
  });
});

describe('Redis unreachable', () => {
  const env = loadEnv({ ...baseEnv, REDIS_URL: `redis://${CLOSED_PORT_URL}` });
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(env);
    await wipe(app);
  });

  afterAll(async () => {
    await wipe(app);
    await app.close();
  });

  it('/health reports redis=error and degraded, with 200, within its own timeout', async () => {
    const { result: response, ms } = await timed(() =>
      app.inject({ method: 'GET', url: '/health' }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'degraded',
      dependencies: { db: 'ok', redis: 'error', s3: 'not_configured' },
    });
    expect(ms).toBeLessThan(3000);
  });

  // Rate limiting (global + per-account) fails open and a notification the
  // queue never accepted is inserted directly (KI-071), so the critical
  // journey — sign up, publish, register — still completes, each step without
  // a stall, and the rider still gets the confirmation.
  // Regression: before CR-137 every request waited on ioredis's offline
  // queue here — list rides 5 s, register 10 s, login > 12 s.
  it('sign-up, ride publishing and registration still succeed', async () => {
    const steps: Array<{ name: string; ms: number }> = [];
    const step = async <T>(name: string, run: () => Promise<T>) => {
      const { result, ms } = await timed(run);
      steps.push({ name, ms });
      return result;
    };

    const { rawToken: organizer, rideId } = await step('organizer', () =>
      organizerWithDraftRide(app),
    );
    const published = await step('publish', () =>
      app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizer },
      }),
    );
    expect(published.statusCode).toBe(200);
    const opened = await step('open registration', () =>
      app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/open-registration`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizer },
      }),
    );
    expect(opened.statusCode).toBe(200);

    const rider = await step('rider sign-up', () => signUp(app));
    const registered = await step('register', () =>
      app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rider },
      }),
    );
    expect(registered.statusCode).toBe(201);
    expect(registered.json().registration.status).toBe('active');

    const participants = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/participants`,
      cookies: { session: organizer },
    });
    expect(participants.statusCode).toBe(200);
    expect(participants.json().items).toHaveLength(1);

    const inbox = await app.inject({
      method: 'GET',
      url: '/v1/notifications/mine',
      cookies: { session: rider },
    });
    expect(inbox.statusCode).toBe(200);
    expect(inbox.json().items).toEqual([
      expect.objectContaining({
        type: 'registration_confirmed',
        ride: expect.objectContaining({ id: rideId }),
      }),
    ]);

    for (const { name, ms } of steps) {
      expect(ms, `${name} took ${Math.round(ms)}ms`).toBeLessThan(2000);
    }
  });
});
