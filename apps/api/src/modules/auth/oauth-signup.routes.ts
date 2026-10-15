import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  OAUTH_SIGNUP_CONSENT_PATH,
  oauthSignupCompleteRequestSchema,
} from 'types';
import type { Env } from '../../env.js';
import { logAuthEvent } from '../../lib/auth-events.js';
import {
  type OAuthIdentity,
  type OAuthProvider,
  OAUTH_PROVIDERS,
  OAuthSignInError,
} from './oauth-sign-in.service.js';
import {
  cancelOAuthSignup,
  completeOAuthSignup,
  OAUTH_SIGNUP_TTL_MS,
  OAuthSignupError,
  readOAuthSignup,
  startOAuthSignup,
} from './oauth-signup.service.js';
import { createSession } from './session.js';
import { setSessionCookie } from './session-cookie.js';

// CR-269 (ADR-041): the consent step of a first Google/Yandex sign-in. The cookie
// carries only an opaque token (`oauth-signup.service.ts`); `__Host-` in production
// like the session and transaction cookies. Same per-IP tier as the auth routes.
const SIGNUP_RATE_LIMIT_DEFAULTS = { max: 10, timeWindow: '1 minute' };
const DEFAULT_AFTER_SIGN_IN = '/me';

export function oauthSignupCookieName(nodeEnv: Env['NODE_ENV']): string {
  return nodeEnv === 'production' ? '__Host-oauth-signup' : 'oauth-signup';
}

function cookieOptions(isProd: boolean) {
  // Lax: the cookie is set on the provider's redirect back (a top-level GET).
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
  } as const;
}

/**
 * Called by a callback whose verified identity has no account: parks it, sets the
 * cookie and sends the browser to `/register/consent`. No user, no session yet.
 */
export async function redirectToOAuthSignupConsent(
  app: FastifyInstance,
  reply: FastifyReply,
  env: Env,
  provider: OAuthProvider,
  identity: OAuthIdentity,
  next: string | null,
) {
  const isProd = env.NODE_ENV === 'production';
  const token = await startOAuthSignup(app.db, provider, identity, next);
  reply.setCookie(oauthSignupCookieName(env.NODE_ENV), token, {
    ...cookieOptions(isProd),
    maxAge: OAUTH_SIGNUP_TTL_MS / 1000,
  });
  reply.header('Cache-Control', 'no-store');
  return reply.redirect(
    new URL(OAUTH_SIGNUP_CONSENT_PATH, env.WEB_ORIGIN).toString(),
    303,
  );
}

const signupResponseSchema = z.object({
  provider: z.enum(OAUTH_PROVIDERS),
  email: z.string(),
});

const completeResponseSchema = z.object({ next: z.string() });

export const oauthSignupRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (
  app,
  opts,
) => {
  const { env } = opts;
  const isProd = env.NODE_ENV === 'production';
  const cookieName = oauthSignupCookieName(env.NODE_ENV);
  const rateLimit = {
    ...SIGNUP_RATE_LIMIT_DEFAULTS,
    max: env.AUTH_RATE_LIMIT_MAX ?? SIGNUP_RATE_LIMIT_DEFAULTS.max,
  };

  const tokenOf = (request: FastifyRequest) => request.cookies[cookieName];
  const clearCookie = (reply: FastifyReply) =>
    reply.clearCookie(cookieName, cookieOptions(isProd));
  const expired = () =>
    new OAuthSignupError(
      'oauth_signup_expired',
      410,
      'Sign-up expired',
      'This sign-up is no longer pending. Start the sign-in again.',
    );

  // `200 { provider, email }` for the consent page; `410 oauth_signup_expired`
  // without a live pending sign-up. The address is the person's own, shown to the
  // browser that holds the cookie.
  app.get(
    '/oauth-signup',
    {
      schema: { response: { 200: signupResponseSchema } },
      config: { rateLimit },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const token = tokenOf(request);
      if (!token) throw expired();
      return reply.status(200).send(await readOAuthSignup(app.db, token));
    },
  );

  // Accept both documents → the account, the acceptance and the session, `200
  // { next }`. `400 consent_required`/validation, `409 legal_version_outdated`
  // (the row stays — reload and retry), `410 oauth_signup_expired` (missing,
  // expired, already used), `409 oauth_signup_failed` (the account is blocked or
  // the identity went to someone else meanwhile).
  app.post(
    '/oauth-signup',
    {
      schema: {
        body: oauthSignupCompleteRequestSchema,
        response: { 200: completeResponseSchema },
      },
      config: { rateLimit },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const token = tokenOf(request);
      if (!token) throw expired();

      let completed;
      try {
        completed = await completeOAuthSignup(
          app.db,
          token,
          request.body.consents,
        );
      } catch (error) {
        if (error instanceof OAuthSignInError) {
          clearCookie(reply);
          request.log.info({ reason: error.reason }, 'OAuth sign-up refused.');
          throw new OAuthSignupError(
            'oauth_signup_failed',
            409,
            'Sign-up failed',
            'The account could not be created. Sign in again.',
          );
        }
        if (error instanceof OAuthSignupError) clearCookie(reply);
        throw error;
      }

      clearCookie(reply);
      const session = await createSession(app.db, completed.userId);
      setSessionCookie(app, reply, session, isProd);
      // `app.log` with `reqId`, like the callbacks' own lines.
      logAuthEvent(app.log, 'oauth_signup', completed.userId, request.id);
      logAuthEvent(
        app.log,
        completed.provider === 'google' ? 'google_sign_in' : 'yandex_sign_in',
        completed.userId,
        request.id,
      );
      return reply
        .status(200)
        .send({ next: completed.next ?? DEFAULT_AFTER_SIGN_IN });
    },
  );

  // «Отмена»: `204`, the parked identity and the cookie gone.
  app.delete(
    '/oauth-signup',
    { config: { rateLimit } },
    async (request, reply) => {
      const token = tokenOf(request);
      if (token) await cancelOAuthSignup(app.db, token);
      clearCookie(reply);
      reply.header('Cache-Control', 'no-store');
      return reply.status(204).send();
    },
  );
};
