import type { FastifyInstance, FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { RedisClient } from '../redis.js';
import {
  UPLOAD_RATE_LIMIT,
  UploadRateLimitedError,
  uploadRateLimit,
  uploadRateLimitKey,
} from './upload-rate-limit.js';

// Same fake as `account-rate-limit.test.ts`: only the `multi()` chain the
// shared counter calls, not a live Redis (KI-014).
function fakeRedis(count: number) {
  const multi = {
    incr: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([[null, count]]),
  };
  return { redis: { multi: () => multi } as unknown as RedisClient, multi };
}

function request(userId: string) {
  return {
    user: { id: userId },
    log: { warn: vi.fn() },
  } as unknown as FastifyRequest;
}

function appWith(redis: RedisClient | null) {
  return { redis } as unknown as FastifyInstance;
}

describe('uploadRateLimit (CR-255)', () => {
  it('lets an upload through up to the per-user max', async () => {
    const { redis, multi } = fakeRedis(UPLOAD_RATE_LIMIT.max);

    await expect(
      uploadRateLimit(appWith(redis))(request('user-1')),
    ).resolves.toBeUndefined();
    expect(multi.incr).toHaveBeenCalledWith(uploadRateLimitKey('user-1'));
    expect(multi.pexpire).toHaveBeenCalledWith(
      uploadRateLimitKey('user-1'),
      UPLOAD_RATE_LIMIT.windowMs,
      'NX',
    );
  });

  it('refuses the upload past the max with a 429 upload_rate_limited', async () => {
    const { redis } = fakeRedis(UPLOAD_RATE_LIMIT.max + 1);

    const error = await uploadRateLimit(appWith(redis))(
      request('user-1'),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadRateLimitedError);
    expect(error).toMatchObject({
      statusCode: 429,
      code: 'upload_rate_limited',
      title: 'Too Many Requests',
    });
  });

  it('fails open with no Redis configured', async () => {
    await expect(
      uploadRateLimit(appWith(null))(request('user-1')),
    ).resolves.toBeUndefined();
  });

  it('keys the counter by user, not by IP or route', () => {
    expect(uploadRateLimitKey('3f1c')).toBe('upload-rl:user:3f1c');
  });
});
