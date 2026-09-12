import { Redis, type RedisOptions } from 'ioredis';

// ioredis, not the official `redis` package: CR-050 ("Async notification
// delivery via Redis queue") will almost certainly use BullMQ, which requires
// ioredis — picking it now avoids a client swap later.
//
// A factory, not a singleton reading `process.env` itself (same shape as
// packages/db's `createDbClient`): the caller owns env validation and passes
// in an already-validated `REDIS_URL`.
//
// Not wired into app.ts or any route yet (ADR-004: "use for caching, rate
// limiting, and jobs only when justified" — no justified consumer exists
// until CR-050/CR-058). The caller MUST attach an `.on('error', ...)`
// listener once it actually uses this client: ioredis (like every Node
// EventEmitter) throws if an `error` event has no listener, and per
// `.claude/rules/resilience.md` a degraded Redis must never crash the
// process — it should log and fail that one operation, not take down a
// critical journey.
export function createRedisClient(url: string, options?: RedisOptions) {
  return new Redis(url, {
    // Bounded retries, not infinite reconnect storms
    // (.claude/rules/resilience.md) — a real consumer may still override
    // this per its own timeout/circuit-breaker needs.
    maxRetriesPerRequest: 3,
    ...options,
  });
}

export type RedisClient = ReturnType<typeof createRedisClient>;
