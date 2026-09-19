import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { registerGracefulShutdown } from './graceful-shutdown.js';

// Fakes `process` (the `on` subset actually used) so signals can be
// triggered directly instead of sending a real OS signal to the test
// process — same DI technique `account-rate-limit.test.ts` uses for Redis.
function fakeSignals() {
  const handlers = new Map<string, () => void>();
  const on = vi.fn((event: string, handler: () => void) => {
    handlers.set(event, handler);
  });
  return {
    signals: { on } as unknown as Pick<NodeJS.Process, 'on'>,
    on,
    trigger: (event: string) => handlers.get(event)?.(),
  };
}

function fakeApp(closeImpl: () => Promise<void>) {
  return {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    close: vi.fn(closeImpl),
  } as unknown as FastifyInstance;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('registerGracefulShutdown', () => {
  it('registers a handler for both SIGTERM and SIGINT', () => {
    const { signals, on } = fakeSignals();
    const app = fakeApp(() => Promise.resolve());
    registerGracefulShutdown(app, { signals, exit: vi.fn() });

    expect(on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
  });

  it('calls app.close() then exits 0 on a clean shutdown', async () => {
    const { signals, trigger } = fakeSignals();
    const app = fakeApp(() => Promise.resolve());
    const exit = vi.fn();
    registerGracefulShutdown(app, { signals, exit });

    trigger('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));

    expect(app.close).toHaveBeenCalledTimes(1);
  });

  it('exits non-zero when app.close() rejects (an onClose hook threw)', async () => {
    const { signals, trigger } = fakeSignals();
    const app = fakeApp(() => Promise.reject(new Error('onClose hook failed')));
    const exit = vi.fn();
    registerGracefulShutdown(app, { signals, exit });

    trigger('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(1));
  });

  it('forces exit if app.close() never resolves in time', async () => {
    const { signals, trigger } = fakeSignals();
    const app = fakeApp(() => new Promise(() => {})); // never resolves
    const exit = vi.fn();
    registerGracefulShutdown(app, { signals, exit });

    trigger('SIGTERM');
    expect(exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('forces an immediate exit on a second signal while already shutting down', async () => {
    const { signals, trigger } = fakeSignals();
    const app = fakeApp(() => new Promise(() => {})); // still in flight
    const exit = vi.fn();
    registerGracefulShutdown(app, { signals, exit });

    trigger('SIGTERM');
    trigger('SIGINT');

    expect(exit).toHaveBeenCalledWith(1);
    expect(app.close).toHaveBeenCalledTimes(1); // second signal doesn't re-close
  });
});
