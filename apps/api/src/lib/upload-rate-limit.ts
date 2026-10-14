import type { FastifyInstance, FastifyRequest } from 'fastify';
import { isAccountRateLimited } from './account-rate-limit.js';

// CR-255 (security audit 1.3). Every image/GPX upload decodes up to 8–10 MB
// (`sharp`, `sax`) and writes to S3, so the global per-IP tier (100/min) alone let
// one account spread across IPs keep the CPU busy. This is a second, per-user gate
// shared by all upload verbs (cover, both avatars, GPX) — generous for a person
// replacing a picture, tight for a script. The global per-IP tier still applies
// (the routes keep no `config.rateLimit` of their own), so anonymous requests stay
// bounded too.
export const UPLOAD_RATE_LIMIT = { max: 10, windowMs: 60_000 } as const;

export class UploadRateLimitedError extends Error {
  readonly code = 'upload_rate_limited';
  // Named like `FastifyError`'s fields — `error-handler.ts` reads them as is.
  readonly statusCode = 429;
  readonly title = 'Too Many Requests';

  constructor() {
    super('Too many uploads from this account. Try again in a minute.');
    this.name = 'UploadRateLimitedError';
  }
}

/** The counter key; a user id is an opaque UUID, not contact data (CR-250). */
export function uploadRateLimitKey(userId: string): string {
  return `upload-rl:user:${userId}`;
}

/**
 * `preHandler` for upload routes, always after `requireAuth`. Runs before the
 * handler reads the multipart body, so a refused upload costs no decode. Fails
 * open on a missing/degraded Redis, like the other tiers
 * (`.claude/rules/resilience.md`).
 */
export function uploadRateLimit(app: FastifyInstance) {
  return async (request: FastifyRequest): Promise<void> => {
    const limited = await isAccountRateLimited({
      redis: app.redis,
      key: uploadRateLimitKey(request.user!.id),
      max: UPLOAD_RATE_LIMIT.max,
      windowMs: UPLOAD_RATE_LIMIT.windowMs,
      logger: request.log,
    });
    if (limited) throw new UploadRateLimitedError();
  };
}
