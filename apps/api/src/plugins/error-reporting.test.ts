import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import { registerErrorReporting } from './error-reporting.js';
import { loadEnv } from '../env.js';

const BASE_ENV_SOURCE = {
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: 'postgresql://localhost:5432/does-not-matter-for-this-test',
  WEB_ORIGIN: 'http://localhost:3000',
};

function createFakeApp() {
  const rootLog = {
    error: vi.fn(),
    warn: vi.fn(),
  } as unknown as FastifyBaseLogger;
  const app = {
    log: rootLog,
    decorate(name: string, value: unknown) {
      (app as unknown as Record<string, unknown>)[name] = value;
    },
  };
  return app as unknown as FastifyInstance & { log: FastifyBaseLogger };
}

function flushMicrotasks() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('registerErrorReporting', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('always logs structurally, even with no webhook configured', () => {
    const app = createFakeApp();
    registerErrorReporting(app, loadEnv(BASE_ENV_SOURCE));

    app.reportError(new Error('boom'), 'Unhandled error', { instance: '/x' });

    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        instance: '/x',
        errorReport: true,
      }),
      'Unhandled error',
    );
  });

  it('wraps a non-Error value thrown as the error', () => {
    const app = createFakeApp();
    registerErrorReporting(app, loadEnv(BASE_ENV_SOURCE));

    app.reportError('just a string', 'Something broke');

    expect(app.log.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'Something broke',
    );
  });

  it('logs through the provided logger, not the root app logger, when given one', () => {
    const app = createFakeApp();
    registerErrorReporting(app, loadEnv(BASE_ENV_SOURCE));
    const requestLog = {
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as FastifyBaseLogger;

    app.reportError(new Error('boom'), 'Unhandled error', {}, requestLog);

    expect(requestLog.error).toHaveBeenCalled();
    expect(app.log.error).not.toHaveBeenCalled();
  });

  it('never throws even when the caller passes a rejecting-fetch scenario (not configured)', () => {
    const app = createFakeApp();
    registerErrorReporting(app, loadEnv(BASE_ENV_SOURCE));

    expect(() => app.reportError(new Error('boom'), 'msg')).not.toThrow();
  });

  it('POSTs to the configured webhook and never throws back into the caller', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchMock);

    const app = createFakeApp();
    registerErrorReporting(
      app,
      loadEnv({
        ...BASE_ENV_SOURCE,
        ERROR_REPORTING_WEBHOOK_URL: 'https://errors.example/ingest',
      }),
    );

    expect(() =>
      app.reportError(new Error('boom'), 'Unhandled error', { instance: '/x' }),
    ).not.toThrow();

    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://errors.example/ingest',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string);
    expect(body.message).toBe('boom');
    expect(body.context).toEqual({ instance: '/x' });
  });

  it('logs a warning (not an exception) when the webhook sink is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    );

    const app = createFakeApp();
    registerErrorReporting(
      app,
      loadEnv({
        ...BASE_ENV_SOURCE,
        ERROR_REPORTING_WEBHOOK_URL: 'https://errors.example/ingest',
      }),
    );

    app.reportError(new Error('boom'), 'Unhandled error');
    await flushMicrotasks();

    expect(app.log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.anything() }),
      'Failed to deliver error report to webhook sink.',
    );
  });

  it('short-circuits the webhook after repeated failures without calling fetch again', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock);

    const app = createFakeApp();
    registerErrorReporting(
      app,
      loadEnv({
        ...BASE_ENV_SOURCE,
        ERROR_REPORTING_WEBHOOK_URL: 'https://errors.example/ingest',
      }),
    );

    // Default failureThreshold is 5 (see error-reporting.ts).
    for (let i = 0; i < 5; i++) {
      app.reportError(new Error('boom'), 'Unhandled error');
      await flushMicrotasks();
    }
    expect(fetchMock).toHaveBeenCalledTimes(5);

    app.reportError(new Error('boom'), 'Unhandled error');
    await flushMicrotasks();

    // Breaker now open: no sixth network call, and no warning spam either.
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });
});
