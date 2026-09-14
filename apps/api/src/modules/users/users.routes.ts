import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { updateProfileRequestSchema } from 'types';
import { requireAuth } from '../../plugins/auth.js';
import { userResponseSchema } from './user-response.schema.js';
import { updateProfile } from './users.service.js';

const updateProfileResponseSchema = z.object({
  user: userResponseSchema,
});

/**
 * `.claude/rules/architecture.md`: `users` is its own capability module,
 * separate from `auth` (session/identity). Registered by `routes/v1.ts` with
 * prefix `/users`. No `GET /me` here on purpose — `GET /v1/auth/me` already
 * returns the full `User` shape (CLAUDE.md: no duplicate concepts).
 */
export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.patch(
    '/me',
    {
      schema: {
        body: updateProfileRequestSchema,
        response: { 200: updateProfileResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      // `requireAuth` guarantees `request.user` is set (401s otherwise) —
      // identity comes only from the verified session, never a body/path
      // field (`.claude/rules/security.md`).
      const user = await updateProfile(app.db, request.user!.id, request.body);
      return reply.status(200).send({ user });
    },
  );
};
