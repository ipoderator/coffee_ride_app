import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { registerRequestSchema, verifyEmailRequestSchema } from 'types';
import type { Env } from '../../env.js';
import { registerUser, verifyEmail } from './auth.service.js';

const userResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
});

// Response is built from an explicit Zod schema (not just the `User` TS type)
// so Fastify's serializer actually strips any unlisted field before it leaves
// the process — a second line of defense, on top of `auth.service.ts`'s own
// `toPublicUser`, against ever returning `passwordHash`
// (`.claude/rules/security.md`).
const registerResponseSchema = z.object({
  user: userResponseSchema,
  verificationUrl: z.string().optional(),
});

const verifyEmailResponseSchema = z.object({
  user: userResponseSchema,
});

// Stricter tier than the general API default (`.claude/rules/security.md`,
// `docs/api.md`). In-memory `@fastify/rate-limit` store per this ticket's scope
// boundaries (KI-014: Redis unverified in this environment) — CR-058 upgrades
// this to a Redis-backed, per-IP-and-per-account limiter.
const AUTH_RATE_LIMIT = { max: 5, timeWindow: '1 minute' };

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

  app.post(
    '/register',
    {
      schema: {
        body: registerRequestSchema,
        response: { 201: registerResponseSchema },
      },
      config: { rateLimit: AUTH_RATE_LIMIT },
    },
    async (request, reply) => {
      const { user, verificationToken } = await registerUser(
        app.db,
        request.body.email,
        request.body.password,
      );

      // Dev-only convenience (this ticket's scope boundaries — real email
      // delivery is ADR-007, still Pending): never populated in production,
      // never logged. Not a clickable page — no verify-email web screen exists
      // yet — but enough for the live-check/manual QA path via a direct POST.
      const body: { user: typeof user; verificationUrl?: string } = { user };
      if (env.NODE_ENV !== 'production') {
        body.verificationUrl = `/v1/auth/verify-email?token=${verificationToken}`;
      }

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
};
