import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  createRideUpdateRequestSchema,
  listNotificationsQuerySchema,
  listRidesQuerySchema,
} from 'types';
import { requireAuth } from '../../plugins/auth.js';
import {
  notificationResponseSchema,
  rideUpdateResponseSchema,
} from './notification-response.schema.js';
import {
  createRideUpdate,
  listMyNotifications,
  listRideUpdates,
  markNotificationRead,
} from './notifications.service.js';

const rideIdParamsSchema = z.object({
  id: z.uuid('id must be a valid ride id.'),
});
const notificationIdParamsSchema = z.object({
  id: z.uuid('id must be a valid notification id.'),
});

const createRideUpdateResponseWrapper = z.object({
  rideUpdate: rideUpdateResponseSchema,
});
const listRideUpdatesResponseSchema = z.object({
  items: z.array(rideUpdateResponseSchema),
  nextCursor: z.string().nullable(),
});
const listNotificationsResponseSchema = z.object({
  items: z.array(notificationResponseSchema),
  nextCursor: z.string().nullable(),
});
const notificationResponseWrapper = z.object({
  notification: notificationResponseSchema,
});

/**
 * CR-039 ("Ride updates"). `.claude/rules/architecture.md`: `notifications` is its
 * own capability module (`.claude/context/current-task.md`'s scope decision),
 * registered by `routes/v1.ts` under the same `/rides` prefix as `ridesRoutes`/
 * `registrationsRoutes` — the URL shape (`/v1/rides/:id/updates`) nests under a
 * specific ride, this is just a third plugin sharing that prefix. Both routes are
 * organizer-only (`assertOwnRide` inside the service layer, `404 ride_not_found`
 * either way).
 */
export const rideUpdatesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/:id/updates',
    {
      schema: {
        params: rideIdParamsSchema,
        body: createRideUpdateRequestSchema,
        response: { 201: createRideUpdateResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const rideUpdate = await createRideUpdate(
        app.db,
        app.log,
        app.notificationQueue,
        request.user!.id,
        request.params.id,
        request.body,
      );
      return reply.status(201).send({ rideUpdate });
    },
  );

  app.get(
    '/:id/updates',
    {
      schema: {
        params: rideIdParamsSchema,
        querystring: listRidesQuerySchema,
        response: { 200: listRideUpdatesResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const page = await listRideUpdates(
        app.db,
        request.user!.id,
        request.params.id,
        request.query,
      );
      return reply.status(200).send(page);
    },
  );
};

/**
 * CR-041 ("In-app notifications"). A separate plugin from
 * {@link rideUpdatesRoutes} — this list has no single-ride parent, same reasoning
 * `myRegistrationsRoutes` already documents for not nesting under `/rides`.
 * Registered under its own `/notifications` prefix in `routes/v1.ts`.
 */
export const myNotificationsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/mine',
    {
      schema: {
        querystring: listNotificationsQuerySchema,
        response: { 200: listNotificationsResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const page = await listMyNotifications(
        app.db,
        request.user!.id,
        request.query,
      );
      return reply.status(200).send(page);
    },
  );

  app.post(
    '/:id/read',
    {
      schema: {
        params: notificationIdParamsSchema,
        response: { 200: notificationResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const notification = await markNotificationRead(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ notification });
    },
  );
};
