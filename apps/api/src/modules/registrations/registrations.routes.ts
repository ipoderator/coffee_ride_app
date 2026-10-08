import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import {
  imageCacheControl,
  imageVersionQuerySchema,
} from '../../lib/image-url.js';
import {
  createRegistrationRequestSchema,
  joinWaitlistRequestSchema,
  listRidesQuerySchema,
  myRegistrationsQuerySchema,
  organizerActivityQuerySchema,
  REGISTRATION_ATTENDANCES,
  setAttendanceRequestSchema,
  updateRegistrationGroupRequestSchema,
} from 'types';
import { requireAuth } from '../../plugins/auth.js';
import {
  rideGroupRefResponseSchema,
  rideWithOrganizerResponseSchema,
} from '../rides/ride-response.schema.js';
import { registrationResponseSchema } from './registration-response.schema.js';
import { waitlistEntryResponseSchema } from './waitlist-entry-response.schema.js';
import { bikeResponseSchema } from '../users/user-response.schema.js';
import {
  cancelRegistration,
  claimFinish,
  confirmClaimedFinishes,
  createRegistration,
  getOwnRegistrationActivity,
  getRiderAvatarDownload,
  getRiderProfile,
  joinWaitlist,
  leaveWaitlist,
  listMyRegistrations,
  listParticipants,
  listRiders,
  listWaitlist,
  setAttendance,
  updateRegistrationGroup,
  withdrawFinishClaim,
} from './registrations.service.js';

const registrationResponseWrapper = z.object({
  registration: registrationResponseSchema,
});
const waitlistEntryResponseWrapper = z.object({
  waitlistEntry: waitlistEntryResponseSchema,
});
const setAttendanceResponseSchema = z.object({ updated: z.number() });
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
  // CR-117 ("Pace groups"): additive.
  group: rideGroupRefResponseSchema.nullable(),
  // CR-181 ("Finish self-check-in"): additive.
  finishClaimedAt: z.string().nullable(),
  attendance: z.enum(REGISTRATION_ATTENDANCES).nullable(),
});
const listParticipantsResponseSchema = z.object({
  items: z.array(rideParticipantSummaryResponseSchema),
  nextCursor: z.string().nullable(),
});

// CR-117/CR-126: `GET /:id/riders` — display name, group, and (CR-126) the opaque
// `registrationId` that unlocks the gated profile/avatar routes below; Fastify's
// Zod serializer strips anything not listed here, so even a future service-layer
// slip can't leak more than this.
const listRidersResponseSchema = z.object({
  items: z.array(
    z.object({
      registrationId: z.string(),
      displayName: z.string().nullable(),
      group: rideGroupRefResponseSchema.nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

// CR-126. Never `phone`/`email` — `getRiderProfile` doesn't even select them.
const riderProfileResponseSchema = z.object({
  registrationId: z.string(),
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  bikes: z.array(bikeResponseSchema),
  distanceWeekKm: z.number().nullable(),
  distanceMonthKm: z.number().nullable(),
  distanceYearKm: z.number().nullable(),
  recentRides: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      startsAt: z.string(),
    }),
  ),
});
const riderProfileResponseWrapper = z.object({
  profile: riderProfileResponseSchema,
});
const riderParamsSchema = z.object({
  id: z.uuid('id must be a valid ride id.'),
  registrationId: z.uuid('registrationId must be a valid registration id.'),
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

// KI-066: `GET /mine/registrations/activity` — a single aggregate, not a page
// (ADR-011 pagination is for collections; same precedent as `/mine/summary`).
// No `userId` in `recent`: the dashboard row links by registration id.
const organizerActivityResponseSchema = z.object({
  activity: z.object({
    recent: z.array(
      z.object({
        id: z.string(),
        rideId: z.string(),
        rideTitle: z.string(),
        displayName: z.string().nullable(),
        group: rideGroupRefResponseSchema.nullable(),
        createdAt: z.string(),
      }),
    ),
    days: z.array(z.object({ date: z.string(), count: z.number() })),
  }),
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
  // ride_registration_not_open` for any other status; `409 ride_full` once
  // `participantLimit` is reached. CR-083 ("Idempotency"): a repeat call while already
  // actively registered is not an error — replies `200` with the existing
  // registration instead of `201`/a `409`.
  // CR-117 ("Pace groups"): optional body `{ groupId }` — required (`422
  // group_required`) once the ride has groups, `422 group_not_found` for a group
  // that isn't this ride's (or any id on a ride without groups).
  app.post(
    '/:id/register',
    {
      schema: {
        params: rideIdParamsSchema,
        body: createRegistrationRequestSchema,
        response: {
          201: registrationResponseWrapper,
          200: registrationResponseWrapper,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { registration, created } = await createRegistration(
        app.db,
        app.log,
        app.notificationQueue,
        request.user!.id,
        request.params.id,
        request.body?.groupId,
      );
      return reply.status(created ? 201 : 200).send({ registration });
    },
  );

  // CR-117: the caller moves their own active registration to another group of the
  // same ride. `404 registration_not_found` without an active registration, `409
  // group_change_not_allowed` once the ride is finished/cancelled, `422
  // group_not_found` for a group that isn't this ride's.
  app.patch(
    '/:id/register',
    {
      schema: {
        params: rideIdParamsSchema,
        body: updateRegistrationGroupRequestSchema,
        response: { 200: registrationResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const registration = await updateRegistrationGroup(
        app.db,
        request.user!.id,
        request.params.id,
        request.body.groupId,
      );
      return reply.status(200).send({ registration });
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
        app.notificationQueue,
        request.user!.id,
        request.params.id,
      );
      return reply.status(204).send();
    },
  );

  // CR-036 ("Waitlist"). `404 ride_not_found` (non-existent/someone else's `draft`),
  // `409 ride_registration_not_open`, `409 registration_already_exists` (already
  // actively registered — a real conflict, register/cancel instead), `409
  // ride_not_full` (there's still an open spot — register instead). CR-083
  // ("Idempotency"): a repeat call while already on the waitlist is not an error —
  // replies `200` with the existing entry instead of `201`/`409
  // waitlist_entry_already_exists`.
  // CR-117: same optional `{ groupId }` body and group rules as `POST .../register`;
  // the choice is carried into the registration a promotion creates.
  app.post(
    '/:id/waitlist',
    {
      schema: {
        params: rideIdParamsSchema,
        body: joinWaitlistRequestSchema,
        response: {
          201: waitlistEntryResponseWrapper,
          200: waitlistEntryResponseWrapper,
        },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { waitlistEntry, created } = await joinWaitlist(
        app.db,
        request.user!.id,
        request.params.id,
        request.body?.groupId,
      );
      return reply.status(created ? 201 : 200).send({ waitlistEntry });
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

  // KI-066: the `/organizer` dashboard's «Новые записи» / «Записи по дням»
  // across every ride the caller organizes — own session only, never a
  // client-supplied organizer id. No `OrganizerProfile` yet is an empty
  // aggregate, not an error (same as `/mine/summary`).
  app.get(
    '/mine/registrations/activity',
    {
      schema: {
        querystring: organizerActivityQuerySchema,
        response: { 200: organizerActivityResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const activity = await getOwnRegistrationActivity(
        app.db,
        request.user!.id,
        request.query,
      );
      return reply.status(200).send({ activity });
    },
  );

  // CR-181 ("Finish self-check-in"). The participant's own claim «I finished» —
  // only a claim, it never changes the organizer-owned `attendance`. Idempotent
  // `200`; `404 registration_not_found` without an active registration, `409
  // ride_not_in_progress` before the start. DELETE withdraws it (`204`), `409
  // attendance_already_decided` once the organizer has recorded an outcome.
  app.post(
    '/:id/finish-claim',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: registrationResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const registration = await claimFinish(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ registration });
    },
  );

  app.delete(
    '/:id/finish-claim',
    { schema: { params: rideIdParamsSchema }, preHandler: requireAuth },
    async (request, reply) => {
      await withdrawFinishClaim(app.db, request.user!.id, request.params.id);
      return reply.status(204).send();
    },
  );

  // CR-181. Organizer-only (`404 ride_not_found` for anyone else), only while the
  // ride is `started`/`finished` (`409 ride_not_in_progress`). One call sets or
  // clears (`attendance: null`) the outcome of the listed participants —
  // selective and batch confirmation alike; an id that is not an active
  // registration of this ride rejects the whole batch (`404 participant_not_found`).
  app.put(
    '/:id/attendance',
    {
      schema: {
        params: rideIdParamsSchema,
        body: setAttendanceRequestSchema,
        response: { 200: setAttendanceResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const updated = await setAttendance(
        app.db,
        request.user!.id,
        request.params.id,
        request.body.registrationIds,
        request.body.attendance,
      );
      return reply.status(200).send({ updated });
    },
  );

  // CR-181. «Confirm everyone who claimed a finish»: bodyless, same gates as
  // `PUT .../attendance`; only claimed + still-undecided registrations change.
  app.post(
    '/:id/attendance/confirm-claimed',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: setAttendanceResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const updated = await confirmClaimedFinishes(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ updated });
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

  // CR-117: who is riding — any *signed-in* user (`401` otherwise; anonymous
  // visitors get only `GET /v1/rides/:id`'s `registrationsCount`), same visibility as
  // `GET /v1/rides/:id` (`404 ride_not_found` for someone else's `draft`). Display
  // name + group only. Active registrations, `createdAt asc`, paginated per ADR-011.
  app.get(
    '/:id/riders',
    {
      schema: {
        params: rideIdParamsSchema,
        querystring: listRidesQuerySchema,
        response: { 200: listRidersResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const page = await listRiders(
        app.db,
        request.user!.id,
        request.params.id,
        request.query,
      );
      return reply.status(200).send(page);
    },
  );

  // CR-126: a rider's card, reached only through a `registrationId` from this
  // same ride's `/riders` list (`resolveRiderAccess` in `registrations.service.ts`
  // is the single access gate — profile owner, the ride's organizer, or a viewer
  // the owner's `profileVisibility` setting allows). `403 riders_hidden` if the
  // organizer turned the list off, `403 profile_private` if the owner's setting
  // doesn't grant this viewer, `404 rider_not_found` for no such active rider.
  app.get(
    '/:id/riders/:registrationId/profile',
    {
      schema: {
        params: riderParamsSchema,
        response: { 200: riderProfileResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const profile = await getRiderProfile(
        app.db,
        request.user!.id,
        request.params.id,
        request.params.registrationId,
      );
      return reply.status(200).send({ profile });
    },
  );

  // CR-126: the body behind the profile card's `avatarUrl` — same access gate,
  // streamed like `users.routes.ts`'s `GET /me/avatar`. Not JSON, so no Zod
  // `response` schema.
  app.get(
    '/:id/riders/:registrationId/avatar',
    {
      schema: {
        params: riderParamsSchema,
        querystring: imageVersionQuerySchema,
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const { body, contentType, objectKey } = await getRiderAvatarDownload(
        app.db,
        app.s3,
        request.user!.id,
        request.params.id,
        request.params.registrationId,
      );
      return reply
        .status(200)
        .header(
          'Cache-Control',
          imageCacheControl(objectKey, request.query.v, 'private'),
        )
        .type(contentType)
        .send(body);
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
