import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createOrganizerProfileRequestSchema,
  updateOrganizerProfileRequestSchema,
} from 'types';
import { requireAuth } from '../../plugins/auth.js';
import {
  readUploadedFile,
  UploadTooLargeError,
} from '../../lib/read-upload.js';
import { organizerProfileResponseSchema } from './organizer-profile-response.schema.js';
import {
  createOrganizerProfile,
  deleteOrganizerAvatar,
  getOrganizerAvatarDownload,
  getOwnOrganizerProfile,
  OrganizerServiceError,
  replaceOrganizerAvatar,
  updateOrganizerProfile,
  uploadOrganizerAvatar,
} from './organizers.service.js';

const avatarResponseSchema = z.object({
  avatarUrl: z.string(),
});

const organizerIdParamsSchema = z.object({ id: z.string().uuid() });

// CR-097 (KI-023 remainder): same cap as `rides.routes.ts`'s cover image and
// `users.routes.ts`'s avatar — no reason for an organizer avatar to differ.
const AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const AVATAR_TOO_LARGE = () =>
  new OrganizerServiceError(
    'avatar_too_large',
    400,
    'Avatar too large',
    'The uploaded file exceeds the maximum avatar upload size.',
  );

async function readAvatarUpload(request: FastifyRequest) {
  try {
    return await readUploadedFile(request, AVATAR_MAX_UPLOAD_BYTES);
  } catch (err) {
    if (err instanceof UploadTooLargeError) throw AVATAR_TOO_LARGE();
    throw err;
  }
}

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

  // CR-097 (KI-023 remainder): create/replace/delete the caller's own avatar,
  // "me"-scoped mutations same as every other route in this module — same
  // 4-verb shape as `rides.routes.ts`'s `.../cover`, minus a draft gate (an
  // organizer profile has no draft state).
  app.post(
    '/me/avatar',
    {
      schema: { response: { 201: avatarResponseSchema } },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const file = await readAvatarUpload(request);
      const result = await uploadOrganizerAvatar(
        app.db,
        app.s3,
        request.user!.id,
        file,
      );
      return reply.status(201).send(result);
    },
  );

  // Replaces an existing avatar. `404 avatar_not_found` if none exists yet —
  // use `POST` instead.
  app.patch(
    '/me/avatar',
    {
      schema: { response: { 200: avatarResponseSchema } },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const file = await readAvatarUpload(request);
      const result = await replaceOrganizerAvatar(
        app.db,
        app.s3,
        request.user!.id,
        file,
      );
      return reply.status(200).send(result);
    },
  );

  app.delete(
    '/me/avatar',
    { preHandler: requireAuth },
    async (request, reply) => {
      await deleteOrganizerAvatar(app.db, app.s3, request.user!.id);
      return reply.status(204).send();
    },
  );

  // Streams the raw image bytes, keyed by organizer id — public, no auth
  // (`organizers.service.ts`'s `getOrganizerAvatarDownload` doc comment: an
  // organizer's identity, including its avatar, is already public via
  // `RideOrganizerSummary`). Not JSON, so no Zod `response` schema (same as
  // `rides.routes.ts`'s `GET .../cover`).
  app.get(
    '/:id/avatar',
    { schema: { params: organizerIdParamsSchema } },
    async (request, reply) => {
      const { body, contentType } = await getOrganizerAvatarDownload(
        app.db,
        app.s3,
        request.params.id,
      );
      // Every upload gets a fresh random S3 key (never reused, same discipline
      // `.../cover` follows), so a long/immutable cache is safe with no
      // cache-busting query param needed by default (ADR-019).
      return reply
        .status(200)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .type(contentType)
        .send(body);
    },
  );
};
