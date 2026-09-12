import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';

// buildApp() never binds a real port (see its own comment) — every test here
// drives the instance through Fastify's `.inject()` instead.
const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
});

describe('GET /health', () => {
  it('returns 200 with the bootstrap status', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });

    await app.close();
  });
});

describe('unmatched routes', () => {
  it('returns an RFC 9457 problem+json 404', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({
      method: 'GET',
      url: '/does-not-exist',
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toContain(
      'application/problem+json',
    );
    const body = response.json();
    expect(body.code).toBe('not_found');
    expect(body.status).toBe(404);
    expect(body.instance).toBe('/does-not-exist');

    await app.close();
  });
});

describe('error handler', () => {
  it('maps a Zod validation failure to 400 with errors[]', async () => {
    const app = await buildApp(testEnv);
    // Ad hoc route, registered only for this test, to exercise
    // error-handler.ts's validation branch without depending on a real
    // domain route — v1Routes is still empty (first route is CR-011).
    app.get(
      '/__test/validated',
      { schema: { querystring: z.object({ name: z.string().min(1) }) } },
      async (request) => ({ name: request.query.name }),
    );

    const response = await app.inject({
      method: 'GET',
      url: '/__test/validated',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('validation_error');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);

    await app.close();
  });

  it('maps an unexpected thrown error to a 500 without leaking internals', async () => {
    const app = await buildApp(testEnv);
    app.get('/__test/boom', async () => {
      throw new Error(
        'connection failed: postgres://user:secret@internal-host/db',
      );
    });

    const response = await app.inject({ method: 'GET', url: '/__test/boom' });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.code).toBe('internal_error');
    expect(body.detail).not.toContain('postgres://');
    expect(body.detail).not.toContain('secret');
    expect(JSON.stringify(body)).not.toContain('at ');

    await app.close();
  });

  it('passes a below-500 thrown error straight through with its own status', async () => {
    const app = await buildApp(testEnv);
    app.get('/__test/forbidden', async () => {
      const error = new Error('Not allowed.') as Error & {
        statusCode?: number;
      };
      error.statusCode = 403;
      throw error;
    });

    const response = await app.inject({
      method: 'GET',
      url: '/__test/forbidden',
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.detail).toBe('Not allowed.');

    await app.close();
  });
});
