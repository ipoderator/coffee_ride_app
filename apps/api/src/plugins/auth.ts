import type { FastifyReply, FastifyRequest } from 'fastify';
import { users } from 'db/schema';
import { validateSession } from '../modules/auth/session.js';

// CR-012 (`docs/decisions.md` ADR-013, `.claude/rules/security.md`). Session
// cookie name centralized here — the one place that both sets (auth.routes.ts)
// and reads (this plugin) it.
export const SESSION_COOKIE_NAME = 'session';

declare module 'fastify' {
  interface FastifyRequest {
    // Populated only inside a route guarded by `requireAuth`; `undefined`
    // everywhere else — routes that need it must opt in via the preHandler,
    // never assume it's present.
    user?: typeof users.$inferSelect;
    sessionId?: string;
  }
}

/**
 * `preHandler` that resolves the session cookie into `request.user`/
 * `request.sessionId`, or replies 401 and short-circuits the request.
 * Identity comes only from the verified session (`.claude/rules/security.md`:
 * never trust a client-supplied id) — every route that needs "who is this"
 * attaches this preHandler explicitly; there is no implicit/global auth.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const token = request.cookies[SESSION_COOKIE_NAME];
  if (!token) {
    return sendUnauthorized(reply, request.url);
  }

  const app = request.server;
  const validated = await validateSession(app.db, token);
  if (!validated) {
    return sendUnauthorized(reply, request.url);
  }

  request.user = validated.user;
  request.sessionId = validated.sessionId;
}

function sendUnauthorized(reply: FastifyReply, instance: string) {
  return reply.status(401).type('application/problem+json').send({
    type: 'https://coffee-ride.example/errors/unauthorized',
    title: 'Unauthorized',
    status: 401,
    detail: 'A valid session is required.',
    instance,
    code: 'unauthorized',
  });
}
