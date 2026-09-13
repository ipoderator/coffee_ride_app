import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../env.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function originFromHeader(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    // A malformed Origin/Referer header is treated as present-but-wrong
    // rather than absent — falling through to "allowed" here would let a
    // garbled header bypass the check entirely.
    return '(unparseable)';
  }
}

/**
 * ADR-013 §2 / CR-012: `SameSite=Lax` already blocks the classic cross-site
 * cookie-riding vector; this preHandler is defense in depth for the cases Lax
 * doesn't cover, not the only layer. Checks `Origin` first, falling back to
 * `Referer`'s origin when `Origin` is absent. When NEITHER header is present,
 * the request is allowed through — a deliberate choice (not every legitimate
 * same-site request sends either), not an oversight.
 *
 * Registered inside `v1Routes` (not globally) so it only ever guards `/v1`,
 * per the requirement — `/health` and anything outside `/v1` is unaffected.
 */
export function registerCsrf(app: FastifyInstance, env: Env) {
  const allowedOrigin = new URL(env.WEB_ORIGIN).origin;

  app.addHook(
    'preHandler',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (!UNSAFE_METHODS.has(request.method)) return;

      const origin =
        originFromHeader(request.headers.origin) ??
        originFromHeader(request.headers.referer);

      if (origin === null) return; // neither header present — allowed through

      if (origin !== allowedOrigin) {
        return reply.status(403).type('application/problem+json').send({
          type: 'https://coffee-ride.example/errors/csrf_origin_mismatch',
          title: 'Cross-origin request rejected',
          status: 403,
          detail: 'Request origin does not match the configured web origin.',
          instance: request.url,
          code: 'csrf_origin_mismatch',
        });
      }
    },
  );
}
