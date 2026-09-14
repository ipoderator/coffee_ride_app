import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  createRideRequestSchema,
  listRidesQuerySchema,
  updateRideRequestSchema,
} from 'types';
import { requireAuth } from '../../plugins/auth.js';
import { rideResponseSchema } from './ride-response.schema.js';
import {
  closeRegistration,
  createRide,
  getRideForOwner,
  listOwnRides,
  openRegistration,
  publishRide,
  updateRideDraft,
} from './rides.service.js';

const rideResponseWrapper = z.object({ ride: rideResponseSchema });
const listRidesResponseSchema = z.object({
  items: z.array(rideResponseSchema),
  nextCursor: z.string().nullable(),
});
const rideIdParamsSchema = z.object({
  id: z.uuid('id must be a valid ride id.'),
});

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

  // CR-088 ("Organizer rides list"): every ride the caller organizes, any status —
  // distinct from the still-unimplemented public `GET /v1/rides` (CR-024), which will
  // only ever surface `published`+ rides to anyone. `/mine`, not a `?filter=`, so
  // "whose rides" is never a client-supplied value (`.claude/rules/security.md`).
  app.get(
    '/mine',
    {
      schema: {
        querystring: listRidesQuerySchema,
        response: { 200: listRidesResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const page = await listOwnRides(app.db, request.user!.id, request.query);
      return reply.status(200).send(page);
    },
  );

  // CR-016/CR-018: ownership-scoped single-ride read. 404s (not 403) for a ride that
  // exists but belongs to a different organizer — see `rides.service.ts`'s
  // `RIDE_NOT_FOUND` comment.
  app.get(
    '/:id',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: rideResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const ride = await getRideForOwner(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ ride });
    },
  );

  // CR-016/CR-018: draft-only edit. `ride_not_editable` (409) once the ride has left
  // `draft` — publishing/cancelling/finishing are separate tickets, not a broader
  // "edit anything anytime" endpoint.
  app.patch(
    '/:id',
    {
      schema: {
        params: rideIdParamsSchema,
        body: updateRideRequestSchema,
        response: { 200: rideResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const ride = await updateRideDraft(
        app.db,
        request.user!.id,
        request.params.id,
        request.body,
      );
      return reply.status(200).send({ ride });
    },
  );

  // CR-019 ("Publish ride"): `draft -> published` only — see `rides.service.ts`'s
  // `publishRide` for the full check order (404 ownership -> 403 email verification
  // -> 409 not-draft).
  app.post(
    '/:id/publish',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: rideResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const ride = await publishRide(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ ride });
    },
  );

  // CR-089 ("Open registration"): `published -> registration_open`, resolving KI-025.
  // Same ownership rule as `publish`; 409 `ride_registration_not_openable` for any
  // other status.
  app.post(
    '/:id/open-registration',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: rideResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const ride = await openRegistration(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ ride });
    },
  );

  // CR-020 ("Close registration"): `registration_open -> registration_closed`. Same
  // ownership rule as `publish`/`open-registration`; 409
  // `ride_registration_not_closable` for any other status.
  app.post(
    '/:id/close-registration',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: rideResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const ride = await closeRegistration(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ ride });
    },
  );
};
