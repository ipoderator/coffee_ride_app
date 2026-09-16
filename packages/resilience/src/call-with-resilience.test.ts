import { describe, expect, it, vi } from 'vitest';
import { callWithResilience } from './call-with-resilience.js';
import { CircuitBreaker } from './circuit-breaker.js';
import { ResilienceError } from './errors.js';

describe('callWithResilience', () => {
  it('returns the result on the first successful attempt', async () => {
    const operation = vi.fn().mockResolvedValue('ok');
    await expect(
      callWithResilience(operation, { timeoutMs: 1000 }),
    ).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('does not retry by default (maxAttempts 1)', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(
      callWithResilience(operation, { timeoutMs: 1000 }),
    ).rejects.toThrow(ResilienceError);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and returns the result of a later successful attempt', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce('ok');

    const result = await callWithResilience(operation, {
      timeoutMs: 1000,
      retries: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
    });

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws a ResilienceError with code "exhausted" once retries run out', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      callWithResilience(operation, {
        timeoutMs: 1000,
        retries: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
      }),
    ).rejects.toMatchObject({ name: 'ResilienceError', code: 'exhausted' });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('throws a ResilienceError with code "timeout" when the operation does not settle in time', async () => {
    const operation = vi.fn(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );

    await expect(
      callWithResilience(operation, { timeoutMs: 20 }),
    ).rejects.toMatchObject({ name: 'ResilienceError', code: 'timeout' });
  });

  it('does not call the operation when the breaker is open', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 1,
      cooldownMs: 10_000,
    });
    breaker.recordFailure();
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(
      callWithResilience(operation, { timeoutMs: 1000, breaker }),
    ).rejects.toMatchObject({ name: 'ResilienceError', code: 'circuit_open' });
    expect(operation).not.toHaveBeenCalled();
  });

  it('records a success on the breaker', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 10_000,
    });
    const operation = vi.fn().mockResolvedValue('ok');

    await callWithResilience(operation, { timeoutMs: 1000, breaker });

    expect(breaker.getState()).toBe('closed');
  });

  it('records exactly one failure on the breaker per call, even after multiple retry attempts', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      cooldownMs: 10_000,
    });
    const operation = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(
      callWithResilience(operation, {
        timeoutMs: 1000,
        retries: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
        breaker,
      }),
    ).rejects.toThrow(ResilienceError);

    expect(breaker.getState()).toBe('closed');

    await expect(
      callWithResilience(operation, {
        timeoutMs: 1000,
        retries: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 2 },
        breaker,
      }),
    ).rejects.toThrow(ResilienceError);

    expect(breaker.getState()).toBe('open');
  });
});
