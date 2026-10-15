import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  loginHref,
  OAUTH_OUTCOME_PROVIDER_PARAM,
  safeNextPath,
  type YandexSignInOutcome,
} from 'types';
import type { Env } from '../../env.js';
import { logAuthEvent } from '../../lib/auth-events.js';
import {
  OAUTH_TRANSACTION_TTL_MS,
  newOAuthTransaction,
  openOAuthTransaction,
  sealOAuthTransaction,
  stateMatches,
} from './oauth-transaction.js';
import {
  OAuthSignInError,
  type OAuthSignInRefusal,
  signInWithOAuth,
} from './oauth-sign-in.service.js';
import { redirectToOAuthSignupConsent } from './oauth-signup.routes.js';
import { createSession } from './session.js';
import { setSessionCookie } from './session-cookie.js';
import {
  YandexRejectedError,
  YandexUnavailableError,
} from './yandex-client.js';

// CR-260 (ADR-037): «Войти через Яндекс», the Google flow (`google.routes.ts`) with
// Yandex ID behind it. Both steps are browser navigations, so every answer is a
// `303` to a page. Per-IP tier of its own, overridable like the auth tier for tests.
const YANDEX_RATE_LIMIT_DEFAULTS = { max: 10, timeWindow: '1 minute' };
const DEFAULT_AFTER_SIGN_IN = '/me';

/** `__Host-` in production (Secure, `Path=/`, no `Domain`), like the session cookie. */
export function yandexTransactionCookieName(nodeEnv: Env['NODE_ENV']): string {
  return nodeEnv === 'production' ? '__Host-yandex-oauth' : 'yandex-oauth';
}

const startQuerySchema = z.object({
  next: z.string().max(2048).optional(),
});

// Yandex may add parameters of its own (`cid`); this schema only bounds what the
// route looks at.
const callbackQuerySchema = z.looseObject({
  code: z.string().max(2048).optional(),
  state: z.string().max(1024).optional(),
  error: z.string().max(256).optional(),
});

const REFUSAL_OUTCOME: Record<OAuthSignInRefusal, YandexSignInOutcome> = {
  email_unverified: 'email_unverified',
  blocked: 'blocked',
  conflict: 'failed',
};

export const yandexAuthRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (
  app,
  opts,
) => {
  const { env } = opts;
  const isProd = env.NODE_ENV === 'production';
  const cookieName = yandexTransactionCookieName(env.NODE_ENV);
  const redirectUri = `${env.WEB_ORIGIN}/api/v1/auth/yandex/callback`;
  const rateLimit = {
    ...YANDEX_RATE_LIMIT_DEFAULTS,
    max: env.AUTH_RATE_LIMIT_MAX ?? YANDEX_RATE_LIMIT_DEFAULTS.max,
  };

  function redirectToWeb(reply: FastifyReply, path: string) {
    reply.header('Cache-Control', 'no-store');
    return reply.redirect(new URL(path, env.WEB_ORIGIN).toString(), 303);
  }

  function failTo(
    reply: FastifyReply,
    outcome: YandexSignInOutcome,
    next: string | null,
  ) {
    const target = new URL(loginHref(next), env.WEB_ORIGIN);
    target.searchParams.set('oauth', outcome);
    target.searchParams.set(OAUTH_OUTCOME_PROVIDER_PARAM, 'yandex');
    return redirectToWeb(reply, `${target.pathname}${target.search}`);
  }

  // `200 { available }` — the login/register pages show the button only when true.
  app.get(
    '/yandex/status',
    { schema: { response: { 200: z.object({ available: z.boolean() }) } } },
    async (_request, reply) =>
      reply.status(200).send({ available: app.yandexOAuth !== null }),
  );

  // `303` to Yandex's consent screen. Remembers state/PKCE verifier and the
  // validated `next` in the signed transaction cookie.
  app.get(
    '/yandex',
    {
      schema: { querystring: startQuerySchema },
      config: { rateLimit },
    },
    async (request, reply) => {
      const next = safeNextPath(request.query.next);
      if (!app.yandexOAuth) return failTo(reply, 'unavailable', next);

      const { transaction, codeChallenge } = newOAuthTransaction(next);
      reply.setCookie(
        cookieName,
        sealOAuthTransaction(env.AUTH_SECRET, 'yandex', transaction),
        {
          httpOnly: true,
          secure: isProd,
          // Lax: Yandex's redirect back is a top-level GET, which still carries it.
          sameSite: 'lax',
          path: '/',
          maxAge: OAUTH_TRANSACTION_TTL_MS / 1000,
        },
      );
      reply.header('Cache-Control', 'no-store');
      return reply.redirect(
        app.yandexOAuth.authorizationUrl({
          redirectUri,
          state: transaction.state,
          codeChallenge,
        }),
        303,
      );
    },
  );

  // Yandex's redirect target (`WEB_ORIGIN/api/v1/auth/yandex/callback`, proxied by
  // apps/web like every `/api/v1/*` path). `logLevel: 'warn'` keeps the single-use
  // `code` out of the request log. Yandex's access token never leaves
  // `completeSignIn`.
  app.get(
    '/yandex/callback',
    {
      schema: { querystring: callbackQuerySchema },
      config: { rateLimit },
      logLevel: 'warn',
    },
    async (request, reply) => {
      // One attempt per cookie, whatever happens next. `secure` too: a browser
      // ignores a `__Host-` Set-Cookie without it, deletion included.
      reply.clearCookie(cookieName, {
        path: '/',
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
      });
      const sealed = request.cookies[cookieName];
      const transaction = sealed
        ? openOAuthTransaction(env.AUTH_SECRET, 'yandex', sealed)
        : null;
      const next = safeNextPath(transaction?.next);

      if (!app.yandexOAuth) return failTo(reply, 'unavailable', next);
      if (!transaction) return failTo(reply, 'expired', next);
      // Before anything else in the query is believed — a declined consent too.
      if (!stateMatches(transaction.state, request.query.state)) {
        request.log.warn('Yandex callback state does not match the cookie.');
        return failTo(reply, 'state', next);
      }
      const { code, error } = request.query;
      if (error === 'access_denied') return failTo(reply, 'cancelled', next);
      if (error || !code) {
        request.log.warn(
          { detail: error ?? 'no code' },
          'Yandex sign-in rejected.',
        );
        return failTo(reply, 'failed', next);
      }

      let userId: string;
      try {
        const identity = await app.yandexOAuth.completeSignIn({
          code,
          codeVerifier: transaction.codeVerifier,
        });
        const result = await signInWithOAuth(app.db, 'yandex', identity, {
          allowCreate: false,
        });
        // CR-268 (ADR-041): a new person accepts the documents before the
        // account and the session exist.
        if (result.kind === 'consent_required') {
          return await redirectToOAuthSignupConsent(
            app,
            reply,
            env,
            'yandex',
            identity,
            next,
          );
        }
        ({ userId } = result);
      } catch (caught) {
        if (caught instanceof YandexRejectedError) {
          request.log.warn(
            { detail: caught.detail },
            'Yandex sign-in rejected.',
          );
          return failTo(reply, 'failed', next);
        }
        if (caught instanceof YandexUnavailableError) {
          request.log.warn({ err: caught }, 'Yandex unavailable at sign-in.');
          return failTo(reply, 'unavailable', next);
        }
        if (caught instanceof OAuthSignInError) {
          // `app.log`: the request log drops `info` on this route.
          app.log.info(
            { reqId: request.id, reason: caught.reason },
            'Yandex sign-in refused.',
          );
          return failTo(reply, REFUSAL_OUTCOME[caught.reason], next);
        }
        app.reportError(caught, 'Yandex sign-in failed', {}, request.log);
        return failTo(reply, 'failed', next);
      }

      const session = await createSession(app.db, userId);
      setSessionCookie(app, reply, session, isProd);
      // `app.log`: the request log drops `info` on this route.
      logAuthEvent(app.log, 'yandex_sign_in', userId, request.id);
      return redirectToWeb(reply, next ?? DEFAULT_AFTER_SIGN_IN);
    },
  );
};
