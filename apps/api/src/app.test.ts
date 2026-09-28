import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildApp } from './app.js';
import { loadEnv } from './env.js';

// buildApp() never binds a real port (see its own comment) — every test here
// drives the instance through Fastify's `.inject()` instead. DATABASE_URL is
// required since CR-011 but never actually queried by the routes exercised
// below — the `postgres` driver connects lazily, so a syntactically valid,
// unreachable URL is enough (see `auth.routes.test.ts` for tests against a
// real database). `GET /health` is the one route that now does query the
// database (CR-051) — its own coverage, including against this same
// unreachable-DB shape, lives in `routes/health.test.ts`, not here.
const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: 'postgresql://test:test@localhost:5432/unused',
  WEB_ORIGIN: 'http://localhost:3000',
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

describe('security headers (CR-061)', () => {
  it('sends CSP/X-Content-Type-Options/X-Frame-Options/Referrer-Policy on an unversioned route', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBeDefined();

    await app.close();
  });

  it('sends the same headers on a /v1 route', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/v1/auth/me' });

    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');

    await app.close();
  });

  it('sends the same headers on /docs (Swagger UI)', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/docs' });

    expect(response.headers['content-security-policy']).toBeDefined();
    expect(response.headers['x-content-type-options']).toBe('nosniff');

    await app.close();
  });

  it('CSP does not include upgrade-insecure-requests (would break local http:// dev)', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['content-security-policy']).not.toContain(
      'upgrade-insecure-requests',
    );

    await app.close();
  });

  it("CSP sets frame-ancestors 'none', matching X-Frame-Options: DENY", async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['content-security-policy']).toContain(
      "frame-ancestors 'none'",
    );

    await app.close();
  });
});

describe('request id (CR-079)', () => {
  it('reuses a valid inbound X-Request-Id and echoes it back', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'caddy-req-abc123' },
    });

    expect(response.headers['x-request-id']).toBe('caddy-req-abc123');

    await app.close();
  });

  it('generates and echoes a request id when none is supplied', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-request-id']).not.toBe('');

    await app.close();
  });

  it('ignores a malformed inbound X-Request-Id and generates its own instead', async () => {
    const app = await buildApp(testEnv);
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'not valid; DROP TABLE users' },
    });

    expect(response.headers['x-request-id']).toBeDefined();
    expect(response.headers['x-request-id']).not.toBe(
      'not valid; DROP TABLE users',
    );

    await app.close();
  });
});

// KI-044: production is Caddy → web → api. Caddy writes the client address into
// X-Forwarded-For, Next's rewrite forwards it without appending its own, and
// `request.ip` keys the per-IP rate limiters.
describe('client address behind the proxy chain (KI-044)', () => {
  async function appReportingIp(trustProxyHops?: number) {
    const app = await buildApp({
      ...testEnv,
      TRUST_PROXY_HOPS: trustProxyHops,
      RATE_LIMIT_MAX: 1,
    });
    app.get('/ip-probe', async (request) => ({ ip: request.ip }));
    return app;
  }
  const probe = (
    app: Awaited<ReturnType<typeof appReportingIp>>,
    xff?: string,
  ) =>
    app.inject({
      method: 'GET',
      url: '/ip-probe',
      remoteAddress: '172.18.0.5', // `web`, the socket peer
      headers: xff ? { 'x-forwarded-for': xff } : {},
    });

  it('ignores X-Forwarded-For by default: the socket peer is the client', async () => {
    const app = await appReportingIp();
    const response = await probe(app, '203.0.113.7');
    expect(response.json().ip).toBe('172.18.0.5');
    await app.close();
  });

  it('with one trusted hop, takes the address Caddy wrote and ignores forged ones', async () => {
    const app = await appReportingIp(1);
    expect((await probe(app, '203.0.113.7')).json().ip).toBe('203.0.113.7');
    expect((await probe(app, '6.6.6.6, 203.0.113.8')).json().ip).toBe(
      '203.0.113.8',
    );
    await app.close();
  });

  it('never trusts a public socket peer, even with a trusted hop configured', async () => {
    const app = await appReportingIp(1);
    const response = await app.inject({
      method: 'GET',
      url: '/ip-probe',
      remoteAddress: '198.51.100.20',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(response.json().ip).toBe('198.51.100.20');
    await app.close();
  });

  it('with one trusted hop, gives each client its own rate-limit bucket', async () => {
    const app = await appReportingIp(1);
    expect((await probe(app, '203.0.113.7')).statusCode).toBe(200);
    expect((await probe(app, '203.0.113.7')).statusCode).toBe(429);
    // A forged left entry doesn't buy a fresh bucket for the same client…
    expect((await probe(app, '6.6.6.6, 203.0.113.7')).statusCode).toBe(429);
    // …while a different real client still gets through.
    expect((await probe(app, '203.0.113.9')).statusCode).toBe(200);
    await app.close();
  });
});
