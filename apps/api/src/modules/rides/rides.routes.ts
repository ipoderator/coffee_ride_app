import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createRideRequestSchema,
  listPublicRidesQuerySchema,
  listRidesQuerySchema,
  updateRideRequestSchema,
} from 'types';
import { requireAuth, resolveOptionalUser } from '../../plugins/auth.js';
import {
  rideOrganizerSummarySchema,
  rideResponseSchema,
  routeGeometryResponseSchema,
  routeSummaryResponseSchema,
  rideWithOrganizerResponseSchema,
} from './ride-response.schema.js';
import {
  RideServiceError,
  cancelRide,
  closeRegistration,
  createRide,
  deleteRoute,
  finishRide,
  getRideForViewer,
  getRouteDownload,
  getRouteGeometry,
  listOwnRides,
  listPublicRides,
  openRegistration,
  publishRide,
  replaceRoute,
  startRide,
  updateRideDraft,
  uploadRoute,
} from './rides.service.js';

const GPX_FILE_TOO_LARGE = () =>
  new RideServiceError(
    'gpx_file_too_large',
    400,
    'GPX file too large',
    'The uploaded file exceeds the maximum GPX upload size.',
  );

/**
 * Reads the one multipart file field (`@fastify/multipart`, registered globally in
 * `app.ts` with `limits.fileSize` = ADR-015's upload cap) into a buffer. `null` if no
 * file part was sent at all — the route layer maps that to `gpx_file_missing`, not a
 * generic 400.
 */
async function readGpxUpload(
  request: FastifyRequest,
): Promise<{ filename: string; buffer: Buffer } | null> {
  const part = await request.file();
  if (!part) {
    return null;
  }
  let buffer: Buffer;
  try {
    buffer = await part.toBuffer();
  } catch (err) {
    if (
      err instanceof Error &&
      (err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE'
    ) {
      throw GPX_FILE_TOO_LARGE();
    }
    throw err;
  }
  return { filename: part.filename, buffer };
}

const rideResponseWrapper = z.object({ ride: rideResponseSchema });
// CR-023 ("Ride detail"): `GET /:id` alone gains the ride's public organizer identity
// alongside the unchanged `ride` field — additive, every other endpoint keeps
// `rideResponseWrapper` as-is. CR-027 ("GPX upload") added `route` (nullable summary,
// same additive discipline).
const rideDetailResponseSchema = z.object({
  ride: rideResponseSchema,
  organizer: rideOrganizerSummarySchema,
  route: routeSummaryResponseSchema.nullable(),
});
const routeResponseWrapper = z.object({ route: routeSummaryResponseSchema });
const listRidesResponseSchema = z.object({
  items: z.array(rideResponseSchema),
  nextCursor: z.string().nullable(),
});
// CR-024 ("Ride list", public discovery): each item additionally carries `organizer`
// — distinct from `listRidesResponseSchema` (`/mine`, no organizer needed since the
// caller already knows it's their own).
const listPublicRidesResponseSchema = z.object({
  items: z.array(rideWithOrganizerResponseSchema),
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

  // CR-024 ("Ride list", public discovery), extended by CR-025 ("Filters"): every
  // upcoming ride that has left `draft`, for any viewer — no `preHandler` at all,
  // `docs/api.md` names this endpoint "no auth" outright (distinct from `/:id`'s
  // `resolveOptionalUser`, which still needs to know *whether* a session exists so
  // an owner can see their own draft). `listPublicRidesQuerySchema` adds the
  // optional `bicycleType` filter on top of `listRidesQuerySchema`'s `limit`/
  // `cursor`.
  app.get(
    '/',
    {
      schema: {
        querystring: listPublicRidesQuerySchema,
        response: { 200: listPublicRidesResponseSchema },
      },
    },
    async (request, reply) => {
      const page = await listPublicRides(app.db, request.query);
      return reply.status(200).send(page);
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

  // CR-016/CR-018 ("Organizer authorization"/"Edit draft"), extended by CR-023 ("Ride
  // detail") to also serve any other viewer: `resolveOptionalUser`, not `requireAuth`
  // — a request with no session cookie at all is a legitimate participant, not an
  // error. 404s `ride_not_found` for a non-existent ride, a `draft` ride viewed by
  // anyone but its own organizer, either the same way (see `rides.service.ts`'s
  // `getRideForViewer`).
  app.get(
    '/:id',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: rideDetailResponseSchema },
      },
      preHandler: resolveOptionalUser,
    },
    async (request, reply) => {
      const result = await getRideForViewer(
        app.db,
        request.user?.id ?? null,
        request.params.id,
      );
      return reply.status(200).send(result);
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

  // CR-021 ("Cancel ride"): `published/registration_open/registration_closed ->
  // cancelled`. Same ownership rule as every other transition; 409
  // `ride_not_cancellable` for any other status (`draft`/`started`/`finished`/
  // already-`cancelled`).
  app.post(
    '/:id/cancel',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: rideResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const ride = await cancelRide(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ ride });
    },
  );

  // CR-090 ("Start ride"): `registration_closed -> started`, resolving KI-027. Same
  // ownership rule as every other transition; 409 `ride_not_startable` for any other
  // status.
  app.post(
    '/:id/start',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: rideResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const ride = await startRide(app.db, request.user!.id, request.params.id);
      return reply.status(200).send({ ride });
    },
  );

  // CR-022 ("Finish ride"): `started -> finished`, the last lifecycle transition.
  // Same ownership rule as every other transition; 409 `ride_not_finishable` for any
  // other status.
  app.post(
    '/:id/finish',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: rideResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const ride = await finishRide(
        app.db,
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ ride });
    },
  );

  // CR-027 ("GPX upload"): multipart, not JSON — no Zod `body` schema (there is
  // nothing for `@fastify/type-provider-zod` to validate; the file itself is
  // checked by hand in `readGpxUpload`/`rides.service.ts`). Same draft-only
  // ownership gate as `PATCH /:id`; 409 `route_already_exists` if one is already
  // present.
  app.post(
    '/:id/route',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 201: routeResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const file = await readGpxUpload(request);
      const route = await uploadRoute(
        app.db,
        app.s3,
        request.user!.id,
        request.params.id,
        file,
      );
      return reply.status(201).send({ route });
    },
  );

  // Replaces an existing route's GPX file. 404 `route_not_found` if none exists yet
  // — use `POST` instead.
  app.patch(
    '/:id/route',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: routeResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const file = await readGpxUpload(request);
      const route = await replaceRoute(
        app.db,
        app.s3,
        request.user!.id,
        request.params.id,
        file,
      );
      return reply.status(200).send({ route });
    },
  );

  app.delete(
    '/:id/route',
    {
      schema: {
        params: rideIdParamsSchema,
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      await deleteRoute(app.db, app.s3, request.user!.id, request.params.id);
      return reply.status(204).send();
    },
  );

  // Streams the raw GPX bytes. Same viewer-visibility rule as `GET /:id`
  // (`resolveOptionalUser`, not `requireAuth`) — not JSON, so no Zod `response`
  // schema; the download itself is the payload.
  app.get(
    '/:id/route/download',
    {
      schema: { params: rideIdParamsSchema },
      preHandler: resolveOptionalUser,
    },
    async (request, reply) => {
      const { body, filename } = await getRouteDownload(
        app.db,
        app.s3,
        request.user?.id ?? null,
        request.params.id,
      );
      return reply
        .status(200)
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .type('application/gpx+xml')
        .send(body);
    },
  );

  // CR-028 ("Route rendering"), resolving KI-035: the full ordered point array behind
  // `GET /:id`'s `route` summary. Same viewer-visibility rule as `.../download`; no S3
  // call (`Route.geometry` is already in the DB row), so no `route_storage_unavailable`
  // case here.
  app.get(
    '/:id/route/geometry',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: routeGeometryResponseSchema },
      },
      preHandler: resolveOptionalUser,
    },
    async (request, reply) => {
      const geometry = await getRouteGeometry(
        app.db,
        request.user?.id ?? null,
        request.params.id,
      );
      return reply.status(200).send(geometry);
    },
  );
};
