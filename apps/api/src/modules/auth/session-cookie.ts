import type { FastifyInstance, FastifyReply } from 'fastify';
import type { CreatedSession } from './session.js';

/**
 * Sets the session cookie (ADR-013) for a just-created session. Shared by password
 * login and Google sign-in (CR-247) so both end in the identical cookie. The name
 * always comes from `app.sessionCookieName` (`__Host-session` in production).
 */
export function setSessionCookie(
  app: FastifyInstance,
  reply: FastifyReply,
  session: CreatedSession,
  isProd: boolean,
) {
  reply.setCookie(app.sessionCookieName, session.token, {
    httpOnly: true,
    // Plain HTTP in local dev (ADR-013) — `Secure` would silently drop the cookie
    // over http://localhost in browsers that don't treat it as a secure context.
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    expires: session.expiresAt,
  });
}

/**
 * KI-099 (CR-257): clears the session cookie with the attributes it was set with.
 * Browsers ignore any `Set-Cookie` for a `__Host-` name without `Secure` — the
 * deletion included — so a bare `clearCookie(name, { path })` left the dead
 * `__Host-session` in place in production.
 */
export function clearSessionCookie(
  app: FastifyInstance,
  reply: FastifyReply,
  isProd: boolean,
) {
  reply.clearCookie(app.sessionCookieName, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  });
}
