import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { platformAdmins, users } from 'db/schema';
import type { Env } from '../env.js';
import { validateSession } from '../modules/auth/session.js';

// CR-012 (`docs/decisions.md` ADR-013, `.claude/rules/security.md`). Session
// cookie name centralized here — the one place that both sets (auth.routes.ts)
// and reads (this plugin) it.
//
// CR-217 (KI-093): `__Host-` in production. A browser accepts such a cookie only
// when it is Secure, Path=/ and has no Domain, set by this exact host — so no
// sibling subdomain can plant or shadow the session. Dev/test keep plain
// `session`: they run over http://, where a browser refuses a `__Host-` cookie.
export function sessionCookieName(nodeEnv: Env['NODE_ENV']): string {
  return nodeEnv === 'production' ? '__Host-session' : 'session';
}

export function registerSessionCookieName(app: FastifyInstance, env: Env) {
  app.decorate('sessionCookieName', sessionCookieName(env.NODE_ENV));
}

declare module 'fastify' {
  interface FastifyInstance {
    sessionCookieName: string;
  }
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
  const token = request.cookies[request.server.sessionCookieName];
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

/**
 * CR-023 ("Ride detail", public read): resolves `request.user`/`sessionId` from the
 * cookie when one is present and valid, but never rejects — for a route a visitor may
 * hit without being logged in at all, where "who is this, if anyone" still needs to
 * be known server-side (e.g. to grant an owner extra visibility a stranger doesn't
 * get). Distinct from `requireAuth`: no route should use both preHandlers together.
 */
export async function resolveOptionalUser(request: FastifyRequest) {
  const token = request.cookies[request.server.sessionCookieName];
  if (!token) return;

  const app = request.server;
  const validated = await validateSession(app.db, token);
  if (!validated) return;

  request.user = validated.user;
  request.sessionId = validated.sessionId;
}

/**
 * CR-229 (ADR-032): `preHandler` for `/v1/admin/*`, always after
 * {@link requireAuth}. Reads `platform_admins` on every request — no session flag,
 * no cache — so revoking the capability from the host CLI takes effect on the very
 * next request. A signed-in non-admin gets the same `404 not_found` body as an
 * unknown route: the admin section's existence is never confirmed to them.
 */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const userId = request.user?.id;
  if (userId) {
    const [row] = await request.server.db
      .select({ userId: platformAdmins.userId })
      .from(platformAdmins)
      .where(eq(platformAdmins.userId, userId))
      .limit(1);
    if (row) return;
  }

  return reply
    .status(404)
    .type('application/problem+json')
    .send({
      type: 'https://coffee-ride.example/errors/not_found',
      title: 'Not Found',
      status: 404,
      detail: `No route matches ${request.method} ${request.url}.`,
      instance: request.url,
      code: 'not_found',
    });
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
