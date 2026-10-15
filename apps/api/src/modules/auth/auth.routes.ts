import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  CONSENT_DOCUMENT_TYPES,
  forgotPasswordRequestSchema,
  loginHref,
  loginRequestSchema,
  registerRequestSchema,
  resetPasswordRequestSchema,
  verifyEmailHref,
  verifyEmailRequestSchema,
} from 'types';
import type { Env } from '../../env.js';
import {
  accountRateLimitKeyFactory,
  isAccountRateLimited,
} from '../../lib/account-rate-limit.js';
import { logAuthEvent } from '../../lib/auth-events.js';
import { requireAuth } from '../../plugins/auth.js';
import {
  sendAccountExistsEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from '../notifications/notifications.service.js';
import { userResponseSchema } from '../users/user-response.schema.js';
import {
  AuthServiceError,
  loginUser,
  registerUser,
  resendEmailVerification,
  requestPasswordReset,
  resetPassword,
  toPublicUser,
  verifyEmail,
} from './auth.service.js';
import {
  assertCurrentConsents,
  pendingAcceptances,
} from '../legal/legal.service.js';
import { legalStateSchema } from '../legal/legal.routes.js';
import { RecaptchaUnavailableError } from './recaptcha-client.js';
import { createSession, revokeSession } from './session.js';
import { clearSessionCookie, setSessionCookie } from './session-cookie.js';

// Response is built from an explicit Zod schema (not just the `User` TS type)
// so Fastify's serializer actually strips any unlisted field before it leaves
// the process — a second line of defense, on top of `auth.service.ts`'s own
// `toPublicUser`, against ever returning `passwordHash`
// (`.claude/rules/security.md`). Shared with `modules/users` (CR-013) so
// there's exactly one "user over the wire" shape, not two that can drift.
// CR-262 (ADR-039): no `user` — the body is the same whether the email was new or
// already had an account.
const registerResponseSchema = z.object({
  emailVerificationRequired: z.boolean(),
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
  legal: legalStateSchema,
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
  const accountRateLimitKey = accountRateLimitKeyFactory(env.AUTH_SECRET);

  // CR-058's per-account tier. Throws the same `AuthServiceError` convention
  // every other domain error in this module uses, so it flows through the
  // existing RFC 9457 error handler unchanged (no new error-handling code).
  async function enforceAccountRateLimit(
    routeName: string,
    identifier: string,
  ) {
    const limited = await isAccountRateLimited({
      redis: app.redis,
      key: accountRateLimitKey(routeName, identifier),
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

  // CR-261 (ADR-038): the reCAPTCHA gate of register, password login and
  // forgot-password. Runs after both rate-limit tiers (a flood is refused before it
  // costs a call to Google) and before the service, so a refusal says nothing about
  // the account — the generic auth errors stay generic. Off while
  // `RECAPTCHA_SECRET_KEY` is unset. Fails closed when Google can't answer: the
  // widget in the browser depends on Google anyway, and an open gate during an
  // outage would be a bot's bypass. The token is never logged.
  async function enforceCaptcha(
    request: FastifyRequest,
    token: string | undefined,
  ) {
    const recaptcha = app.recaptcha;
    if (!recaptcha) return;

    if (!token) {
      throw new AuthServiceError(
        'captcha_required',
        400,
        'Bad Request',
        'Complete the CAPTCHA and try again.',
      );
    }

    let verdict;
    try {
      verdict = await recaptcha.verify(token, request.ip);
    } catch (error) {
      if (!(error instanceof RecaptchaUnavailableError)) throw error;
      request.log.warn({ err: error }, 'reCAPTCHA verification unavailable');
      throw new AuthServiceError(
        'captcha_unavailable',
        503,
        'Service Unavailable',
        'The CAPTCHA check is temporarily unavailable. Try again later.',
      );
    }
    if (!verdict.ok) {
      request.log.info({ reason: verdict.reason }, 'reCAPTCHA token rejected');
      throw new AuthServiceError(
        'captcha_invalid',
        400,
        'Bad Request',
        'The CAPTCHA was not passed or has expired. Complete it again.',
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
      preHandler: [
        async (request) =>
          enforceAccountRateLimit('register', request.body.email),
        // CR-268 (ADR-041): a stale page is told before the CAPTCHA is spent.
        async (request) =>
          assertCurrentConsents(request.body.consents, CONSENT_DOCUMENT_TYPES),
        async (request) => enforceCaptcha(request, request.body.captchaToken),
      ],
    },
    async (request, reply) => {
      const result = await registerUser(
        app.db,
        request.body.email,
        request.body.password,
        { skipEmailVerification: env.AUTH_SKIP_EMAIL_VERIFICATION },
      );

      // CR-262 (ADR-039): the same status and body either way. `verificationUrl`
      // below is dev-only and is the one difference, never sent in production.
      const body: {
        emailVerificationRequired: boolean;
        verificationUrl?: string;
      } = { emailVerificationRequired: !env.AUTH_SKIP_EMAIL_VERIFICATION };

      if (!result.created) {
        logAuthEvent(
          request.log,
          'register_existing_email',
          result.existingUserId,
        );
        // The owner of the address learns that someone tried, and how to get in;
        // the caller learns nothing. Same delivery policy as the verification
        // email, so the response time matches too.
        await sendAccountExistsEmail(
          app.log,
          app.notificationQueue,
          app.emailProvider,
          request.body.email,
          `${env.WEB_ORIGIN}${loginHref(request.body.next)}`,
          `${env.WEB_ORIGIN}/forgot-password`,
        );
        return reply.status(201).send(body);
      }

      const { user, verificationToken } = result;
      logAuthEvent(request.log, 'register', user.id);

      // CR-220: the account is already verified — no link, no email.
      if (verificationToken === null) {
        return reply.status(201).send(body);
      }

      // Dev-only convenience, unchanged by CR-100/ADR-007: never populated in
      // production, never logged — the raw API path here, not the real
      // `/verify-email` web page `apps/web`'s `RegisterForm` links to
      // (CR-099); kept for the direct-POST live-check/manual QA path.
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
        // CR-244 (KI-089): the return target rides along, validated by the
        // same `safeNextPath` the web pages use — an unsafe one is dropped.
        `${env.WEB_ORIGIN}${verifyEmailHref(verificationToken, request.body.next)}`,
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
      logAuthEvent(request.log, 'email_verified', user.id);
      return reply.status(200).send({ user });
    },
  );

  /**
   * CR-168 (KI-026): the only way a user can obtain a replacement
   * verification link. Session-authenticated and bodyless — identity comes
   * from `request.user` (`.claude/rules/security.md`: never a client-supplied
   * email/userId), which also means there is no account-existence oracle here
   * and so, unlike `/forgot-password`, no need for a response that ignores its
   * own outcome. `204` either way all the same: whether a token was issued is
   * the caller's own already-known verification state, not new information.
   */
  app.post(
    '/resend-verification',
    {
      config: { rateLimit: AUTH_RATE_LIMIT },
      preHandler: [
        requireAuth,
        async (request: FastifyRequest) =>
          // Keyed by the authenticated user id, not an email from the body —
          // this route has no body. Its own route name, so it gets an
          // independent budget from login/register rather than sharing one.
          enforceAccountRateLimit('resend-verification', request.user!.id),
      ],
    },
    async (request, reply) => {
      // `requireAuth` guarantees `request.user` is set (401s otherwise).
      const user = request.user!;
      const result = await resendEmailVerification(app.db, user.id);

      if (result.issued) {
        await sendVerificationEmail(
          app.log,
          app.notificationQueue,
          app.emailProvider,
          user.email,
          `${env.WEB_ORIGIN}/verify-email?token=${result.verificationToken}`,
        );
      }

      return reply.status(204).send();
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
      preHandler: [
        async (request) => enforceAccountRateLimit('login', request.body.email),
        async (request) => enforceCaptcha(request, request.body.captchaToken),
      ],
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

      setSessionCookie(app, reply, session, isProd);
      logAuthEvent(request.log, 'login', user.id);

      return reply.status(200).send({ user });
    },
  );

  app.post(
    '/forgot-password',
    {
      schema: { body: forgotPasswordRequestSchema },
      config: { rateLimit: AUTH_RATE_LIMIT },
      preHandler: [
        async (request) =>
          enforceAccountRateLimit('forgot-password', request.body.email),
        async (request) => enforceCaptcha(request, request.body.captchaToken),
      ],
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
      logAuthEvent(request.log, 'password_reset', user.id);
      return reply.status(200).send({ user });
    },
  );

  // CR-268: signing out never waits on re-consent (ADR-041).
  app.post(
    '/logout',
    { preHandler: requireAuth, config: { legalAcceptanceExempt: true } },
    async (request, reply) => {
      const token = request.cookies[request.server.sessionCookieName];
      // `requireAuth` already 401s when the cookie is missing/invalid, so a
      // valid raw token is guaranteed to be present here.
      if (token) {
        await revokeSession(app.db, token);
      }
      logAuthEvent(request.log, 'logout', request.user!.id);

      clearSessionCookie(app, reply, isProd);
      return reply.status(204).send();
    },
  );

  app.get(
    '/me',
    {
      schema: { response: { 200: meResponseSchema } },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      // `requireAuth` guarantees `request.user` is set (401s otherwise).
      const user = toPublicUser(request.user!);
      const pending = await pendingAcceptances(app.db, user.id);
      return reply.status(200).send({ user, legal: { pending } });
    },
  );
};
