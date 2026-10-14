import { createHmac } from 'node:crypto';
import type { FastifyBaseLogger } from 'fastify';
import type { RedisClient } from '../redis.js';
import { raceTimeout } from './race-timeout.js';

// Fast — this sits on the hot path of login/register/forgot-password and
// must never add meaningful latency, let alone a real hang (ioredis commands
// don't accept an `AbortSignal`, same gotcha `race-timeout.ts` already names
// for `routes/health.ts`).
const REDIS_OP_TIMEOUT_MS = 500;

// CR-250. The key used to carry the raw email, which then sat in Redis and
// reached the API log on every fail-open warning (and in ioredis'
// `ReplyError.command.args`). An HMAC keeps one counter per account without
// the address: keyed (not a bare hash) so a leaked key can't be confirmed
// against a guessed email, the key derived from AUTH_SECRET under its own
// label so it never doubles as another signature (`oauth-transaction.ts`).
const KEY_LABEL = 'coffee-ride/account-rate-limit-key/v1';

/**
 * Builds the per-account counter key. Returns a function so the derived HMAC
 * key is computed once per plugin instance. The identifier is trimmed and
 * lowercased the way `auth.service.ts` normalizes emails, so `A@b.test` and
 * `a@b.test ` share one counter (the account they reach is the same).
 */
export function accountRateLimitKeyFactory(authSecret: string) {
  const hmacKey = createHmac('sha256', authSecret).update(KEY_LABEL).digest();
  return (routeName: string, identifier: string): string => {
    const digest = createHmac('sha256', hmacKey)
      .update(identifier.trim().toLowerCase())
      .digest('base64url');
    return `auth-rl:account:${routeName}:${digest}`;
  };
}

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
    // No `key` here — it identifies the account (CR-250).
    logger.warn(
      { err },
      'Account-level rate limit check failed; allowing the request through (fail-open, .claude/rules/resilience.md).',
    );
    return false;
  }
}
