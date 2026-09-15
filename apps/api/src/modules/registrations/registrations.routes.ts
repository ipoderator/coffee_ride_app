import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { requireAuth } from '../../plugins/auth.js';
import { registrationResponseSchema } from './registration-response.schema.js';
import {
  cancelRegistration,
  createRegistration,
} from './registrations.service.js';

const registrationResponseWrapper = z.object({
  registration: registrationResponseSchema,
});
const rideIdParamsSchema = z.object({
  id: z.uuid('id must be a valid ride id.'),
});

/**
 * `.claude/rules/architecture.md`: `registrations` is its own capability module
 * (`.claude/context/current-task.md`'s scope decision), registered by `routes/v1.ts`
 * under the same `/rides` prefix as `ridesRoutes` — the URL shape
 * (`/v1/rides/:id/register`) is unaffected, this is just a second plugin sharing
 * that prefix. `requireAuth` on both: identity comes only from the verified session,
 * never a client-supplied user id (`.claude/rules/security.md`).
 */
export const registrationsRoutes: FastifyPluginAsyncZod = async (app) => {
  // CR-032 ("Register"), CR-034/CR-035 bundled in (capacity + duplicate protection —
  // see `registrations.service.ts`'s `createRegistration`). `404 ride_not_found` for a
  // non-existent ride or someone else's still-`draft` one; `409
  // ride_registration_not_open` for any other status; `409
  // registration_already_exists`; `409 ride_full` once `participantLimit` is reached.
  app.post(
    '/:id/register',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 201: registrationResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const registration = await createRegistration(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(201).send({ registration });
    },
  );

  // CR-033 ("Cancel registration"). `404 registration_not_found` if the caller has no
  // active registration for this ride (covers a non-existent ride the same way — no
  // separate ride-existence check, same resource-enumeration-safe shape used
  // elsewhere).
  app.delete(
    '/:id/register',
    {
      schema: {
        params: rideIdParamsSchema,
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      await cancelRegistration(app.db, request.user!.id, request.params.id);
      return reply.status(204).send();
    },
  );
};
