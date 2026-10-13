import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { loginHref, safeNextPath, type GoogleSignInOutcome } from 'types';
import type { Env } from '../../env.js';
import {
  GoogleRejectedError,
  GoogleUnavailableError,
} from './google-client.js';
import {
  GOOGLE_TRANSACTION_TTL_MS,
  newGoogleTransaction,
  openGoogleTransaction,
  sealGoogleTransaction,
  stateMatches,
} from './google-transaction.js';
import {
  GoogleSignInError,
  type GoogleSignInRefusal,
  signInWithGoogle,
} from './google.service.js';
import { createSession } from './session.js';
import { setSessionCookie } from './session-cookie.js';

// CR-247 (ADR-034). Both steps are browser navigations, so every answer is a `303`
// to a page — an error body would strand the person mid-sign-in. Per-IP tier of its
// own (each sign-in costs two requests), overridable like the auth tier for tests.
const GOOGLE_RATE_LIMIT_DEFAULTS = { max: 10, timeWindow: '1 minute' };
const DEFAULT_AFTER_SIGN_IN = '/me';

/** `__Host-` in production (Secure, `Path=/`, no `Domain`), like the session cookie. */
export function googleTransactionCookieName(nodeEnv: Env['NODE_ENV']): string {
  return nodeEnv === 'production' ? '__Host-google-oauth' : 'google-oauth';
}

const startQuerySchema = z.object({
  next: z.string().max(2048).optional(),
});

// Google adds `scope`, `authuser`, `prompt`, `hd`, `iss` beside these; openid-client
// reads the raw query, this schema only bounds what the route itself looks at.
const callbackQuerySchema = z.looseObject({
  code: z.string().max(2048).optional(),
  state: z.string().max(512).optional(),
  error: z.string().max(256).optional(),
});

const REFUSAL_OUTCOME: Record<GoogleSignInRefusal, GoogleSignInOutcome> = {
  email_unverified: 'email_unverified',
  account_unverified: 'account_unverified',
  blocked: 'blocked',
  conflict: 'failed',
};

export const googleAuthRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (
  app,
  opts,
) => {
  const { env } = opts;
  const isProd = env.NODE_ENV === 'production';
  const cookieName = googleTransactionCookieName(env.NODE_ENV);
  const redirectUri = `${env.WEB_ORIGIN}/api/v1/auth/google/callback`;
  const rateLimit = {
    ...GOOGLE_RATE_LIMIT_DEFAULTS,
    max: env.AUTH_RATE_LIMIT_MAX ?? GOOGLE_RATE_LIMIT_DEFAULTS.max,
  };

  function redirectToWeb(reply: FastifyReply, path: string) {
    reply.header('Cache-Control', 'no-store');
    return reply.redirect(new URL(path, env.WEB_ORIGIN).toString(), 303);
  }

  function failTo(
    reply: FastifyReply,
    outcome: GoogleSignInOutcome,
    next: string | null,
  ) {
    const target = new URL(loginHref(next), env.WEB_ORIGIN);
    target.searchParams.set('oauth', outcome);
    return redirectToWeb(reply, `${target.pathname}${target.search}`);
  }

  // `200 { available }` — the login/register pages show the button only when true.
  app.get(
    '/google/status',
    { schema: { response: { 200: z.object({ available: z.boolean() }) } } },
    async (_request, reply) =>
      reply.status(200).send({ available: app.googleOidc !== null }),
  );

  // `303` to Google's consent screen. Remembers state/nonce/PKCE verifier and the
  // validated `next` in the signed transaction cookie.
  app.get(
    '/google',
    {
      schema: { querystring: startQuerySchema },
      config: { rateLimit },
    },
    async (request, reply) => {
      const next = safeNextPath(request.query.next);
      if (!app.googleOidc) return failTo(reply, 'unavailable', next);

      const { transaction, codeChallenge } = newGoogleTransaction(next);
      reply.setCookie(
        cookieName,
        sealGoogleTransaction(env.AUTH_SECRET, transaction),
        {
          httpOnly: true,
          secure: isProd,
          // Lax: Google's redirect back is a top-level GET, which still carries it.
          sameSite: 'lax',
          path: '/',
          maxAge: GOOGLE_TRANSACTION_TTL_MS / 1000,
        },
      );
      reply.header('Cache-Control', 'no-store');
      return reply.redirect(
        app.googleOidc.authorizationUrl({
          redirectUri,
          state: transaction.state,
          nonce: transaction.nonce,
          codeChallenge,
        }),
        303,
      );
    },
  );

  // Google's redirect target (`WEB_ORIGIN/api/v1/auth/google/callback`, proxied by
  // apps/web like every `/api/v1/*` path). `logLevel: 'warn'` keeps the single-use
  // `code` out of the request log. Google's tokens never leave `completeSignIn`.
  app.get(
    '/google/callback',
    {
      schema: { querystring: callbackQuerySchema },
      config: { rateLimit },
      logLevel: 'warn',
    },
    async (request, reply) => {
      // One attempt per cookie, whatever happens next.
      // `secure` too: a browser ignores a `__Host-` Set-Cookie without it, deletion
      // included.
      reply.clearCookie(cookieName, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
      });
      const sealed = request.cookies[cookieName];
      const transaction = sealed
        ? openGoogleTransaction(env.AUTH_SECRET, sealed)
        : null;
      const next = safeNextPath(transaction?.next);

      if (!app.googleOidc) return failTo(reply, 'unavailable', next);
      if (!transaction) return failTo(reply, 'expired', next);
      if (!stateMatches(transaction.state, request.query.state)) {
        request.log.warn('Google callback state does not match the cookie.');
        return failTo(reply, 'state', next);
      }

      const callbackUrl = new URL(redirectUri);
      callbackUrl.search = new URL(
        request.url,
        'http://callback.invalid',
      ).search;

      let userId: string;
      try {
        const identity = await app.googleOidc.completeSignIn({
          callbackUrl,
          expectedState: transaction.state,
          expectedNonce: transaction.nonce,
          codeVerifier: transaction.codeVerifier,
        });
        ({ userId } = await signInWithGoogle(app.db, identity));
      } catch (error) {
        if (error instanceof GoogleRejectedError) {
          if (error.reason === 'cancelled') {
            return failTo(reply, 'cancelled', next);
          }
          request.log.warn(
            { detail: error.detail },
            'Google sign-in rejected.',
          );
          return failTo(reply, 'failed', next);
        }
        if (error instanceof GoogleUnavailableError) {
          request.log.warn({ err: error }, 'Google unavailable at sign-in.');
          return failTo(reply, 'unavailable', next);
        }
        if (error instanceof GoogleSignInError) {
          // `app.log`: the request log drops `info` on this route.
          app.log.info(
            { reqId: request.id, reason: error.reason },
            'Google sign-in refused.',
          );
          return failTo(reply, REFUSAL_OUTCOME[error.reason], next);
        }
        app.reportError(error, 'Google sign-in failed', {}, request.log);
        return failTo(reply, 'failed', next);
      }

      const session = await createSession(app.db, userId);
      setSessionCookie(app, reply, session, isProd);
      return redirectToWeb(reply, next ?? DEFAULT_AFTER_SIGN_IN);
    },
  );
};
