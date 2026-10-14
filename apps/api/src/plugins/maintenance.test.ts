import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { loadEnv } from '../env.js';

// CR-265: `MAINTENANCE_MODE`. Same unreachable-DB shape as `app.test.ts` — the
// gate answers before anything touches the database.
function envWith(extra: Record<string, string>) {
  return loadEnv({
    NODE_ENV: 'test',
    AUTH_SECRET: 'a-test-only-secret',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/unused',
    WEB_ORIGIN: 'http://localhost:3000',
    ...extra,
  });
}

let app: Awaited<ReturnType<typeof buildApp>> | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('maintenance env', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['0', false],
    ['yes', false],
    ['true', true],
    ['TRUE', true],
    ['1', true],
    [' true ', true],
  ])('MAINTENANCE_MODE=%j → %s', (value, enabled) => {
    const env = envWith(value === undefined ? {} : { MAINTENANCE_MODE: value });
    expect(env.MAINTENANCE_MODE).toBe(enabled);
  });

  it.each([
    [undefined, 600],
    ['', 600],
    ['abc', 600],
    ['0', 600],
    ['-5', 600],
    ['86401', 600],
    ['1.5', 600],
    ['120', 120],
    ['86400', 86400],
  ])('MAINTENANCE_RETRY_AFTER_SECONDS=%j → %d', (value, seconds) => {
    const env = envWith(
      value === undefined ? {} : { MAINTENANCE_RETRY_AFTER_SECONDS: value },
    );
    expect(env.MAINTENANCE_RETRY_AFTER_SECONDS).toBe(seconds);
  });
});

describe('maintenance mode', () => {
  it('is off by default: /v1 answers as usual', async () => {
    app = await buildApp(envWith({}));
    const response = await app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.headers['retry-after']).toBeUndefined();
  });

  it.each([
    ['GET', '/v1/auth/me'],
    ['GET', '/v1/rides?limit=5'],
    ['POST', '/v1/auth/login'],
    ['POST', '/v1/rides/abc/register'],
    ['GET', '/v1/auth/google'],
  ] as const)(
    'answers %s %s with 503, Retry-After, no-store and nothing internal',
    async (method, url) => {
      app = await buildApp(
        envWith({
          MAINTENANCE_MODE: 'true',
          MAINTENANCE_RETRY_AFTER_SECONDS: '120',
        }),
      );
      // No Origin, a malformed body: the gate answers before CSRF and validation.
      const response = await app.inject({
        method,
        url,
        ...(method === 'POST'
          ? { payload: '{', headers: { 'content-type': 'application/json' } }
          : {}),
      });

      expect(response.statusCode).toBe(503);
      expect(response.headers['retry-after']).toBe('120');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      const body = response.json();
      expect(body).toEqual({
        type: 'https://coffee-ride.example/errors/maintenance',
        title: 'Service Unavailable',
        status: 503,
        detail: 'Planned maintenance is in progress. Retry later.',
        instance: url.split('?')[0],
        code: 'maintenance',
      });
      expect(response.body).not.toMatch(/stack|secret|postgres|at \w+ \(/i);
    },
  );

  it('defaults Retry-After to 600 seconds', async () => {
    app = await buildApp(envWith({ MAINTENANCE_MODE: 'true' }));
    const response = await app.inject({ method: 'GET', url: '/v1/auth/me' });
    expect(response.statusCode).toBe(503);
    expect(response.headers['retry-after']).toBe('600');
  });

  it('keeps /health answering', async () => {
    app = await buildApp(envWith({ MAINTENANCE_MODE: 'true' }));
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveProperty('dependencies');
  });

  it.each([
    '/v1/auth/google/callback?code=x&state=y',
    '/v1/auth/yandex/callback?code=x&state=y',
    '/v1/strava/callback?code=x&state=y',
  ])('lets the provider callback %s through', async (url) => {
    app = await buildApp(envWith({ MAINTENANCE_MODE: 'true' }));
    const response = await app.inject({ method: 'GET', url });
    expect(response.statusCode).not.toBe(503);
    expect(response.headers['retry-after']).toBeUndefined();
  });

  it('still answers an unknown /v1 route with its 404', async () => {
    app = await buildApp(envWith({ MAINTENANCE_MODE: 'true' }));
    const response = await app.inject({ method: 'GET', url: '/v1/nope' });
    expect(response.statusCode).toBe(404);
  });
});
