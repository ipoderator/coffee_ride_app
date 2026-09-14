import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { createRideRequestSchema } from 'types';
import { requireAuth } from '../../plugins/auth.js';
import { rideResponseSchema } from './ride-response.schema.js';
import { createRide } from './rides.service.js';

const rideResponseWrapper = z.object({ ride: rideResponseSchema });

/**
 * `.claude/rules/architecture.md`: `rides` is its own capability module. Registered
 * by `routes/v1.ts` with prefix `/rides`. `requireAuth` only — identity comes from the
 * verified session, ownership (which `OrganizerProfile` the ride belongs to) is
 * resolved server-side in `rides.service.ts`, never a client-supplied id
 * (`.claude/rules/security.md`).
 */
export const ridesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/',
    {
      schema: {
        body: createRideRequestSchema,
        response: { 201: rideResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const ride = await createRide(app.db, request.user!.id, request.body);
      return reply.status(201).send({ ride });
    },
  );
};
