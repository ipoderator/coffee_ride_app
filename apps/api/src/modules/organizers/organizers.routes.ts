import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  createOrganizerProfileRequestSchema,
  updateOrganizerProfileRequestSchema,
} from 'types';
import { requireAuth } from '../../plugins/auth.js';
import { organizerProfileResponseSchema } from './organizer-profile-response.schema.js';
import {
  createOrganizerProfile,
  getOwnOrganizerProfile,
  updateOrganizerProfile,
} from './organizers.service.js';

// CR-043 ("Organizer rating summary"): additive `rating`/`reviewCount` siblings
// alongside `organizerProfile`, same "additive field on the response wrapper, not
// nested inside the entity" precedent `GetRideResponse` already established for
// `organizer`/`route`/`stops`.
const organizerProfileResponseWrapper = z.object({
  organizerProfile: organizerProfileResponseSchema,
  rating: z.number().nullable(),
  reviewCount: z.number(),
});

/**
 * `.claude/rules/architecture.md`: `organizers` is its own capability module,
 * separate from `users`/`auth`. Registered by `routes/v1.ts` with prefix
 * `/organizers`. All three routes are "me"-scoped — identity comes only from
 * the verified session (`requireAuth`), never a client-supplied id
 * (`.claude/rules/security.md`). No public `GET /:id` yet — nothing reads
 * organizer data publicly until `Ride` exists (deferred to whichever ride
 * ticket first needs it, per `.claude/context/current-task.md`).
 */
export const organizersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/me',
    {
      schema: {
        body: createOrganizerProfileRequestSchema,
        response: { 201: organizerProfileResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const response = await createOrganizerProfile(
        app.db,
        request.user!.id,
        request.body,
      );
      return reply.status(201).send(response);
    },
  );

  app.get(
    '/me',
    {
      schema: { response: { 200: organizerProfileResponseWrapper } },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const response = await getOwnOrganizerProfile(app.db, request.user!.id);
      return reply.status(200).send(response);
    },
  );

  app.patch(
    '/me',
    {
      schema: {
        body: updateOrganizerProfileRequestSchema,
        response: { 200: organizerProfileResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const response = await updateOrganizerProfile(
        app.db,
        request.user!.id,
        request.body,
      );
      return reply.status(200).send(response);
    },
  );
};
