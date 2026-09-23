import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  createRideGroupRequestSchema,
  listRidesQuerySchema,
  updateRideGroupRequestSchema,
} from 'types';
import { requireAuth } from '../../plugins/auth.js';
import { rideGroupResponseSchema } from './ride-response.schema.js';
import {
  createRideGroup,
  deleteRideGroup,
  listRideGroups,
  updateRideGroup,
} from './ride-groups.service.js';

const rideIdParamsSchema = z.object({
  id: z.uuid('id must be a valid ride id.'),
});
const groupIdParamsSchema = z.object({
  id: z.uuid('id must be a valid ride id.'),
  groupId: z.uuid('groupId must be a valid group id.'),
});
const groupResponseWrapper = z.object({ group: rideGroupResponseSchema });
const listGroupsResponseSchema = z.object({
  items: z.array(
    rideGroupResponseSchema.extend({ registrationsCount: z.number() }),
  ),
  nextCursor: z.string().nullable(),
});

/**
 * CR-117 ("Pace groups", ADR-022). Organizer-only CRUD for a ride's pace groups — a
 * separate plugin from `ridesRoutes` (same `rides` capability module, same `/rides`
 * prefix in `routes/v1.ts`), same precedent as `registrationsRoutes` sharing that
 * prefix. `requireAuth` on every route; ownership is resolved server-side from the
 * session in `ride-groups.service.ts`, never a client-supplied id — `404
 * ride_not_found` for a non-existent ride or someone else's, either way.
 *
 * Unlike stops/route points (draft-only), groups stay editable in every status but
 * `finished`/`cancelled` (`409 ride_groups_not_editable`).
 */
export const rideGroupsRoutes: FastifyPluginAsyncZod = async (app) => {
  // Organizer-only list, any status, `position` order, each with its live active
  // registration count. Paginated per ADR-011.
  app.get(
    '/:id/groups',
    {
      schema: {
        params: rideIdParamsSchema,
        querystring: listRidesQuerySchema,
        response: { 200: listGroupsResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const page = await listRideGroups(
        app.db,
        request.user!.id,
        request.params.id,
        request.query,
      );
      return reply.status(200).send(page);
    },
  );

  // Appends a group (`position` server-assigned). `409 group_limit_reached` past 6,
  // `409 group_name_taken` for a case-insensitive duplicate within the ride.
  app.post(
    '/:id/groups',
    {
      schema: {
        params: rideIdParamsSchema,
        body: createRideGroupRequestSchema,
        response: { 201: groupResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const group = await createRideGroup(
        app.db,
        request.user!.id,
        request.params.id,
        request.body,
      );
      return reply.status(201).send({ group });
    },
  );

  // Any subset of `name`/`paceKmh`/`description`/`position`; `position` reorders
  // (the others shift). `404 group_not_found` for another ride's/unknown group.
  app.patch(
    '/:id/groups/:groupId',
    {
      schema: {
        params: groupIdParamsSchema,
        body: updateRideGroupRequestSchema,
        response: { 200: groupResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const group = await updateRideGroup(
        app.db,
        request.user!.id,
        request.params.id,
        request.params.groupId,
        request.body,
      );
      return reply.status(200).send({ group });
    },
  );

  // `409 group_has_registrations` while an active registration or waiting waitlist
  // entry points at the group. Remaining groups are renumbered.
  app.delete(
    '/:id/groups/:groupId',
    {
      schema: { params: groupIdParamsSchema },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      await deleteRideGroup(
        app.db,
        request.user!.id,
        request.params.id,
        request.params.groupId,
      );
      return reply.status(204).send();
    },
  );
};
