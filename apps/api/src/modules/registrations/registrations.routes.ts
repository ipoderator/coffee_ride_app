import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { listRidesQuerySchema, myRegistrationsQuerySchema } from 'types';
import { requireAuth } from '../../plugins/auth.js';
import { rideWithOrganizerResponseSchema } from '../rides/ride-response.schema.js';
import { registrationResponseSchema } from './registration-response.schema.js';
import { waitlistEntryResponseSchema } from './waitlist-entry-response.schema.js';
import {
  cancelRegistration,
  createRegistration,
  joinWaitlist,
  leaveWaitlist,
  listMyRegistrations,
  listParticipants,
  listWaitlist,
} from './registrations.service.js';

const registrationResponseWrapper = z.object({
  registration: registrationResponseSchema,
});
const waitlistEntryResponseWrapper = z.object({
  waitlistEntry: waitlistEntryResponseSchema,
});
const rideIdParamsSchema = z.object({
  id: z.uuid('id must be a valid ride id.'),
});

// CR-037 ("Organizer participant list"). Own shape, not `registrationResponseSchema`/
// `waitlistEntryResponseSchema` (`packages/types`' `RideParticipantSummary` comment
// explains why) — reused for both `/participants` and `/waitlist`'s collection items.
const rideParticipantSummaryResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  displayName: z.string().nullable(),
  createdAt: z.string(),
});
const listParticipantsResponseSchema = z.object({
  items: z.array(rideParticipantSummaryResponseSchema),
  nextCursor: z.string().nullable(),
});

// CR-091 ("My registrations", `.claude/context/current-task.md`): reuses
// `registrationResponseSchema`/`rideWithOrganizerResponseSchema` as-is — no third
// shape invented (`.claude/CLAUDE.md`: no duplicate concepts).
const myRegistrationSummaryResponseSchema = z.object({
  registration: registrationResponseSchema,
  ride: rideWithOrganizerResponseSchema,
});
const listMyRegistrationsResponseSchema = z.object({
  items: z.array(myRegistrationSummaryResponseSchema),
  nextCursor: z.string().nullable(),
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
        app.log,
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
      await cancelRegistration(
        app.db,
        app.log,
        request.user!.id,
        request.params.id,
      );
      return reply.status(204).send();
    },
  );

  // CR-036 ("Waitlist"). `404 ride_not_found` (non-existent/someone else's `draft`),
  // `409 ride_registration_not_open`, `409 registration_already_exists` (already
  // actively registered), `409 ride_not_full` (there's still an open spot — register
  // instead), `409 waitlist_entry_already_exists`.
  app.post(
    '/:id/waitlist',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 201: waitlistEntryResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const waitlistEntry = await joinWaitlist(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(201).send({ waitlistEntry });
    },
  );

  // CR-036 ("Waitlist"). `404 waitlist_entry_not_found` if the caller has no waiting
  // entry for this ride.
  app.delete(
    '/:id/waitlist',
    {
      schema: {
        params: rideIdParamsSchema,
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      await leaveWaitlist(app.db, request.user!.id, request.params.id);
      return reply.status(204).send();
    },
  );

  // CR-037 ("Organizer participant list"). Organizer-only at any ride status —
  // `404 ride_not_found` for a non-existent ride or one that isn't the caller's
  // (same resource-enumeration-safe rule every other organizer-only endpoint uses).
  // Active registrations only, `createdAt asc`.
  app.get(
    '/:id/participants',
    {
      schema: {
        params: rideIdParamsSchema,
        querystring: listRidesQuerySchema,
        response: { 200: listParticipantsResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const page = await listParticipants(
        app.db,
        request.user!.id,
        request.params.id,
        request.query,
      );
      return reply.status(200).send(page);
    },
  );

  // CR-037. Same ownership gate as `/participants`. `waiting` entries only,
  // `createdAt asc` — exact FIFO order, the queue's own real order.
  app.get(
    '/:id/waitlist',
    {
      schema: {
        params: rideIdParamsSchema,
        querystring: listRidesQuerySchema,
        response: { 200: listParticipantsResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const page = await listWaitlist(
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
 * CR-091 ("My registrations", `.claude/context/current-task.md`). A separate plugin
 * from {@link registrationsRoutes} — that one is mounted at the `/rides` prefix
 * (every path nests under a specific ride); this list has no single-ride parent, and
 * `/v1/rides/mine` is already the organizer's own-rides list (CR-088). Registered
 * under its own `/registrations` prefix in `routes/v1.ts`, same capability module
 * either way (`.claude/rules/architecture.md`'s feature-boundary list).
 */
export const myRegistrationsRoutes: FastifyPluginAsyncZod = async (app) => {
  // `when` required (no "all" default) — same "explicit filter, not a default that
  // changes response shape" discipline `bicycleType` already uses for discovery.
  // Active registrations only, each joined with its ride's public+organizer summary.
  app.get(
    '/mine',
    {
      schema: {
        querystring: myRegistrationsQuerySchema,
        response: { 200: listMyRegistrationsResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const page = await listMyRegistrations(
        app.db,
        request.user!.id,
        request.query,
      );
      return reply.status(200).send(page);
    },
  );
};
