import { describe, expect, it, vi } from 'vitest';
import type { RedisClient } from '../redis.js';
import {
  accountRateLimitKeyFactory,
  isAccountRateLimited,
} from './account-rate-limit.js';

// Mocks only the `multi().incr().pexpire().exec()` chain this module
// actually calls — same "mock the SDK, exercise the real wiring" technique
// `queue.test.ts` uses for `ioredis`/`bullmq`, not a live Redis (KI-014).
function fakeRedis(execResult: unknown) {
  const multi = {
    incr: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(execResult),
  };
  return {
    redis: { multi: () => multi } as unknown as RedisClient,
    multi,
  };
}

const logger = { warn: vi.fn() };

describe('isAccountRateLimited', () => {
  it('returns false (not limited) when redis is null — not configured is a supported mode', async () => {
    const result = await isAccountRateLimited({
      redis: null,
      key: 'k',
      max: 5,
      windowMs: 60_000,
      logger,
    });
    expect(result).toBe(false);
  });

  it('returns false while the count is at or below max', async () => {
    const { redis } = fakeRedis([[null, 5]]);
    const result = await isAccountRateLimited({
      redis,
      key: 'k',
      max: 5,
      windowMs: 60_000,
      logger,
    });
    expect(result).toBe(false);
  });

  it('returns true once the count exceeds max', async () => {
    const { redis } = fakeRedis([[null, 6]]);
    const result = await isAccountRateLimited({
      redis,
      key: 'k',
      max: 5,
      windowMs: 60_000,
      logger,
    });
    expect(result).toBe(true);
  });

  it('sets the TTL only on the first hit (PEXPIRE ... NX), same window every call', async () => {
    const { redis, multi } = fakeRedis([[null, 1]]);
    await isAccountRateLimited({
      redis,
      key: 'auth-rl:account:login:a@b.test',
      max: 5,
      windowMs: 60_000,
      logger,
    });
    expect(multi.incr).toHaveBeenCalledWith('auth-rl:account:login:a@b.test');
    expect(multi.pexpire).toHaveBeenCalledWith(
      'auth-rl:account:login:a@b.test',
      60_000,
      'NX',
    );
  });

  it('fails OPEN (not limited) when the Redis call rejects', async () => {
    const redis = {
      multi: () => ({
        incr: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('connection lost')),
      }),
    } as unknown as RedisClient;

    const result = await isAccountRateLimited({
      redis,
      key: 'k',
      max: 5,
      windowMs: 60_000,
      logger,
    });
    expect(result).toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('CR-250: the fail-open warning carries no key (it identifies the account)', async () => {
    const warn = vi.fn();
    const redis = {
      multi: () => ({
        incr: vi.fn().mockReturnThis(),
        pexpire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('connection lost')),
      }),
    } as unknown as RedisClient;

    await isAccountRateLimited({
      redis,
      key: 'auth-rl:account:login:secret-key-material',
      max: 5,
      windowMs: 60_000,
      logger: { warn },
    });
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).not.toHaveProperty('key');
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain(
      'secret-key-material',
    );
  });

  it('fails OPEN when exec() itself resolves null (transaction aborted)', async () => {
    const { redis } = fakeRedis(null);
    const result = await isAccountRateLimited({
      redis,
      key: 'k',
      max: 5,
      windowMs: 60_000,
      logger,
    });
    expect(result).toBe(false);
  });
});

describe('accountRateLimitKeyFactory (CR-250)', () => {
  const key = accountRateLimitKeyFactory('test-auth-secret');

  it('keeps the email out of the key, under the auth-rl:account:<route>: prefix', () => {
    const k = key('login', 'rider@example.test');
    expect(k).toMatch(/^auth-rl:account:login:[A-Za-z0-9_-]{43}$/);
    expect(k).not.toContain('rider');
    expect(k).not.toContain('example');
  });

  it('is stable and normalizes case and surrounding spaces like auth.service.ts', () => {
    expect(key('login', ' Rider@Example.TEST ')).toBe(
      key('login', 'rider@example.test'),
    );
  });

  it('separates routes, accounts and secrets', () => {
    const base = key('login', 'rider@example.test');
    expect(key('register', 'rider@example.test')).not.toBe(base);
    expect(key('login', 'other@example.test')).not.toBe(base);
    expect(
      accountRateLimitKeyFactory('another-secret')(
        'login',
        'rider@example.test',
      ),
    ).not.toBe(base);
  });
});
