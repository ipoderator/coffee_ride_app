import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  forgotPasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailRequestSchema,
} from 'types';
import type { Env } from '../../env.js';
import { isAccountRateLimited } from '../../lib/account-rate-limit.js';
import { requireAuth, SESSION_COOKIE_NAME } from '../../plugins/auth.js';
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../notifications/notifications.service.js';
import { userResponseSchema } from '../users/user-response.schema.js';
import {
  AuthServiceError,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPassword,
  toPublicUser,
  verifyEmail,
} from './auth.service.js';
import { createSession, revokeSession } from './session.js';

// Response is built from an explicit Zod schema (not just the `User` TS type)
// so Fastify's serializer actually strips any unlisted field before it leaves
// the process — a second line of defense, on top of `auth.service.ts`'s own
// `toPublicUser`, against ever returning `passwordHash`
// (`.claude/rules/security.md`). Shared with `modules/users` (CR-013) so
// there's exactly one "user over the wire" shape, not two that can drift.
const registerResponseSchema = z.object({
  user: userResponseSchema,
  verificationUrl: z.string().optional(),
});

const verifyEmailResponseSchema = z.object({
  user: userResponseSchema,
});

const loginResponseSchema = z.object({
  user: userResponseSchema,
});

const resetPasswordResponseSchema = z.object({
  user: userResponseSchema,
});

const meResponseSchema = z.object({
  user: userResponseSchema,
});

// Stricter tier than the general API default (`.claude/rules/security.md`,
// `docs/api.md`). Redis-backed when `REDIS_URL` is configured (`app.ts`'s
// global `rateLimit` registration passes `app.redis` into the plugin), the
// plugin's own in-memory store otherwise — either way, per-IP only. CR-058
// pairs this with the independent per-account tier below.
// `max` is overridable by `env.AUTH_RATE_LIMIT_MAX` (KI-014, test/dev only —
// `loadEnv()` rejects it in production); resolved per plugin instance below.
const AUTH_RATE_LIMIT_DEFAULTS = { max: 5, timeWindow: '1 minute' };

// Independent of AUTH_RATE_LIMIT above — a separate gate, not a combined
// key (`.claude/rules/security.md`: "per IP and per account"). Same order of
// magnitude as the per-IP tier: whichever of the two a real attacker trips
// first is the one that blocks them; no separate policy was asked for beyond
// "both dimensions exist." Only applies to register/login/forgot-password —
// verify-email/reset-password operate on opaque single-use tokens, not an
// account identifiable from the request body.
// `max` shares the same `env.AUTH_RATE_LIMIT_MAX` override as the per-IP tier.
const ACCOUNT_RATE_LIMIT_DEFAULTS = { max: 5, windowMs: 60_000 };

function accountRateLimitKey(routeName: string, email: string) {
  return `auth-rl:account:${routeName}:${email}`;
}

/**
 * `.claude/rules/architecture.md`: first capability module under
 * `apps/api/src/modules/`. Registered by `routes/v1.ts` with prefix `/auth`.
 *
 * Typed `FastifyPluginAsyncZod` (not a plain `FastifyInstance` parameter): the
 * Zod type provider `buildApp()` sets up only carries through the plugin
 * chain when every step is typed for it — otherwise `request.body` degrades
 * to `unknown` despite the Zod schema below.
 */
export const authRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (
  app,
  opts,
) => {
  const { env } = opts;
  const isProd = env.NODE_ENV === 'production';
  const AUTH_RATE_LIMIT = {
    ...AUTH_RATE_LIMIT_DEFAULTS,
    max: env.AUTH_RATE_LIMIT_MAX ?? AUTH_RATE_LIMIT_DEFAULTS.max,
  };
  const ACCOUNT_RATE_LIMIT = {
    ...ACCOUNT_RATE_LIMIT_DEFAULTS,
    max: env.AUTH_RATE_LIMIT_MAX ?? ACCOUNT_RATE_LIMIT_DEFAULTS.max,
  };

  // CR-058's per-account tier. Throws the same `AuthServiceError` convention
  // every other domain error in this module uses, so it flows through the
  // existing RFC 9457 error handler unchanged (no new error-handling code).
  async function enforceAccountRateLimit(routeName: string, email: string) {
    const limited = await isAccountRateLimited({
      redis: app.redis,
      key: accountRateLimitKey(routeName, email),
      max: ACCOUNT_RATE_LIMIT.max,
      windowMs: ACCOUNT_RATE_LIMIT.windowMs,
      logger: app.log,
    });
    if (limited) {
      throw new AuthServiceError(
        'account_rate_limited',
        429,
        'Too Many Requests',
        'Too many attempts for this account. Try again later.',
      );
    }
  }

  app.post(
    '/register',
    {
      schema: {
        body: registerRequestSchema,
        response: { 201: registerResponseSchema },
      },
      config: { rateLimit: AUTH_RATE_LIMIT },
      preHandler: async (request) =>
        enforceAccountRateLimit('register', request.body.email),
    },
    async (request, reply) => {
      const { user, verificationToken } = await registerUser(
        app.db,
        request.body.email,
        request.body.password,
      );

      // Dev-only convenience, unchanged by CR-100/ADR-007: never populated in
      // production, never logged — the raw API path here, not the real
      // `/verify-email` web page `apps/web`'s `RegisterForm` links to
      // (CR-099); kept for the direct-POST live-check/manual QA path.
      const body: { user: typeof user; verificationUrl?: string } = { user };
      if (env.NODE_ENV !== 'production') {
        body.verificationUrl = `/v1/auth/verify-email?token=${verificationToken}`;
      }

      // CR-100 (ADR-007): the real email, independent of the dev-only field
      // above — sent (or enqueued) either way, in every environment. A no-op
      // when Unisender isn't configured (`app.emailProvider === null`).
      await sendVerificationEmail(
        app.log,
        app.notificationQueue,
        app.emailProvider,
        user.email,
        `${env.WEB_ORIGIN}/verify-email?token=${verificationToken}`,
      );

      return reply.status(201).send(body);
    },
  );

  app.post(
    '/verify-email',
    {
      schema: {
        body: verifyEmailRequestSchema,
        response: { 200: verifyEmailResponseSchema },
      },
      config: { rateLimit: AUTH_RATE_LIMIT },
    },
    async (request, reply) => {
      const user = await verifyEmail(app.db, request.body.token);
      return reply.status(200).send({ user });
    },
  );

  app.post(
    '/login',
    {
      schema: {
        body: loginRequestSchema,
        response: { 200: loginResponseSchema },
      },
      config: { rateLimit: AUTH_RATE_LIMIT },
      preHandler: async (request) =>
        enforceAccountRateLimit('login', request.body.email),
    },
    async (request, reply) => {
      // Generic `invalid_credentials` for both "no such account" and "wrong
      // password" is enforced inside `loginUser` itself, not here
      // (`.claude/rules/security.md`: no account enumeration).
      const user = await loginUser(
        app.db,
        request.body.email,
        request.body.password,
      );

      const session = await createSession(app.db, user.id);

      reply.setCookie(SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        // Plain HTTP in local dev (ADR-013 / this ticket's requirements) —
        // `Secure` would silently drop the cookie over http://localhost.
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        expires: session.expiresAt,
      });

      return reply.status(200).send({ user });
    },
  );

  app.post(
    '/forgot-password',
    {
      schema: { body: forgotPasswordRequestSchema },
      config: { rateLimit: AUTH_RATE_LIMIT },
      preHandler: async (request) =>
        enforceAccountRateLimit('forgot-password', request.body.email),
    },
    async (request, reply) => {
      // The response stays identical whether or not the email belongs to a
      // real account (`.claude/rules/security.md`: no account enumeration)
      // — `204`, no body, always, regardless of the branch below. The new
      // per-account 429 above doesn't weaken this: it fires purely from
      // request *count* against that exact email string, identical whether
      // or not it belongs to a real account.
      const result = await requestPasswordReset(app.db, request.body.email);

      // CR-100 (ADR-007): only reached, and only sends, when the account is
      // real — the branch itself is invisible to the caller either way,
      // since the response below never depends on it.
      if (result.userFound) {
        await sendPasswordResetEmail(
          app.log,
          app.notificationQueue,
          app.emailProvider,
          request.body.email,
          `${env.WEB_ORIGIN}/reset-password?token=${result.resetToken}`,
        );
      }

      return reply.status(204).send();
    },
  );

  app.post(
    '/reset-password',
    {
      schema: {
        body: resetPasswordRequestSchema,
        response: { 200: resetPasswordResponseSchema },
      },
      config: { rateLimit: AUTH_RATE_LIMIT },
    },
    async (request, reply) => {
      const user = await resetPassword(
        app.db,
        request.body.token,
        request.body.password,
      );
      return reply.status(200).send({ user });
    },
  );

  app.post('/logout', { preHandler: requireAuth }, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    // `requireAuth` already 401s when the cookie is missing/invalid, so a
    // valid raw token is guaranteed to be present here.
    if (token) {
      await revokeSession(app.db, token);
    }

    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return reply.status(204).send();
  });

  app.get(
    '/me',
    {
      schema: { response: { 200: meResponseSchema } },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      // `requireAuth` guarantees `request.user` is set (401s otherwise).
      const user = toPublicUser(request.user!);
      return reply.status(200).send({ user });
    },
  );
};
