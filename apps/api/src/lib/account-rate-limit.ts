import type { FastifyBaseLogger } from 'fastify';
import type { RedisClient } from '../redis.js';
import { raceTimeout } from './race-timeout.js';

// Fast — this sits on the hot path of login/register/forgot-password and
// must never add meaningful latency, let alone a real hang (ioredis commands
// don't accept an `AbortSignal`, same gotcha `race-timeout.ts` already names
// for `routes/health.ts`).
const REDIS_OP_TIMEOUT_MS = 500;

export interface AccountRateLimitParams {
  redis: RedisClient | null;
  key: string;
  max: number;
  windowMs: number;
  logger: Pick<FastifyBaseLogger, 'warn'>;
}

/**
 * Per-account counter, independent of `@fastify/rate-limit`'s per-IP tier
 * (`.claude/rules/security.md`: "per IP and per account" — two separate
 * gates, not one combined key). `MULTI INCR + PEXPIRE key windowMs NX EXEC`
 * is atomic and needs no Lua script: `PEXPIRE ... NX` (Redis 7+) sets the
 * TTL only on the window's first hit, the same semantics
 * `@fastify/rate-limit`'s own Redis store implements with a hand-written
 * script.
 *
 * Fails OPEN, not closed: `redis === null` (not configured) or any error/
 * timeout both return `false` (not limited). Login/register/forgot-password
 * are critical journeys (`.claude/rules/resilience.md`) — a degraded Redis
 * must only cost this extra protection layer, never block a real user.
 */
export async function isAccountRateLimited(
  params: AccountRateLimitParams,
): Promise<boolean> {
  const { redis, key, max, windowMs, logger } = params;
  if (!redis) return false;

  try {
    const results = await raceTimeout(
      redis.multi().incr(key).pexpire(key, windowMs, 'NX').exec(),
      REDIS_OP_TIMEOUT_MS,
      `Account rate limit check timed out after ${REDIS_OP_TIMEOUT_MS}ms.`,
    );
    if (!results || !results[0]) return false;

    const [incrErr, current] = results[0];
    if (incrErr) throw incrErr;

    return (current as number) > max;
  } catch (err) {
    logger.warn(
      { err, key },
      'Account-level rate limit check failed; allowing the request through (fail-open, .claude/rules/resilience.md).',
    );
    return false;
  }
}
