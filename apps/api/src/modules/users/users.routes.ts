import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import {
  createBikeRequestSchema,
  listRidesQuerySchema,
  updateBikeRequestSchema,
  updateProfileRequestSchema,
} from 'types';
import { requireAuth } from '../../plugins/auth.js';
import {
  readUploadedFile,
  UploadTooLargeError,
} from '../../lib/read-upload.js';
import {
  bikeResponseSchema,
  userResponseSchema,
} from './user-response.schema.js';
import {
  createBike,
  deleteAvatar,
  deleteBike,
  getAvatarDownload,
  listBikes,
  replaceAvatar,
  updateBike,
  updateProfile,
  uploadAvatar,
  UserServiceError,
} from './users.service.js';

const updateProfileResponseSchema = z.object({
  user: userResponseSchema,
});

const avatarResponseSchema = z.object({
  avatarUrl: z.string(),
});

const bikeIdParamsSchema = z.object({
  bikeId: z.uuid('bikeId must be a valid bike id.'),
});
const bikeResponseWrapper = z.object({ bike: bikeResponseSchema });
const listBikesResponseSchema = z.object({
  items: z.array(bikeResponseSchema),
  nextCursor: z.string().nullable(),
});

// CR-097 (KI-023 remainder): smaller than GPX's 10 MB, same as `rides.routes.ts`'s
// cover-image cap — an avatar has no reason to be any larger than a ride cover.
const AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const AVATAR_TOO_LARGE = () =>
  new UserServiceError(
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

/**
 * `.claude/rules/architecture.md`: `users` is its own capability module,
 * separate from `auth` (session/identity). Registered by `routes/v1.ts` with
 * prefix `/users`. No `GET /me` here on purpose — `GET /v1/auth/me` already
 * returns the full `User` shape (CLAUDE.md: no duplicate concepts).
 */
export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.patch(
    '/me',
    {
      schema: {
        body: updateProfileRequestSchema,
        response: { 200: updateProfileResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      // `requireAuth` guarantees `request.user` is set (401s otherwise) —
      // identity comes only from the verified session, never a body/path
      // field (`.claude/rules/security.md`).
      const user = await updateProfile(app.db, request.user!.id, request.body);
      return reply.status(200).send({ user });
    },
  );

  // CR-097 (KI-023 remainder): create/replace/delete/download an avatar for the
  // caller's own account, same 4-verb shape as `rides.routes.ts`'s
  // `.../cover` — entirely "me"-scoped, no `:id` variant (see this module's own
  // doc comment and `users.service.ts`'s `getAvatarDownload`).
  app.post(
    '/me/avatar',
    {
      schema: { response: { 201: avatarResponseSchema } },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const file = await readAvatarUpload(request);
      const result = await uploadAvatar(app.db, app.s3, request.user!.id, file);
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
      const result = await replaceAvatar(
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
      await deleteAvatar(app.db, app.s3, request.user!.id);
      return reply.status(204).send();
    },
  );

  // Streams the raw image bytes. Authenticated, "me"-scoped — not JSON, so no
  // Zod `response` schema (same as `rides.routes.ts`'s `GET .../cover`).
  app.get('/me/avatar', { preHandler: requireAuth }, async (request, reply) => {
    const { body, contentType } = await getAvatarDownload(
      app.db,
      app.s3,
      request.user!.id,
    );
    // Every upload gets a fresh random S3 key (never reused), so a long/
    // immutable cache is safe (ADR-019's same reasoning for ride covers) — but
    // this path never changes (it's always `/v1/users/me/avatar`), so the
    // client must cache-bust with its own query param on replace, same as
    // `CoverImageUploadForm` already does.
    return reply
      .status(200)
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .type(contentType)
      .send(body);
  });

  // CR-126 ("garage"): "me"-scoped bike CRUD, same 4-verb shape/ownership
  // discipline as the avatar routes above.
  app.get(
    '/me/bikes',
    {
      schema: {
        querystring: listRidesQuerySchema,
        response: { 200: listBikesResponseSchema },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const page = await listBikes(app.db, request.user!.id, request.query);
      return reply.status(200).send(page);
    },
  );

  app.post(
    '/me/bikes',
    {
      schema: {
        body: createBikeRequestSchema,
        response: { 201: bikeResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const bike = await createBike(app.db, request.user!.id, request.body);
      return reply.status(201).send({ bike });
    },
  );

  app.patch(
    '/me/bikes/:bikeId',
    {
      schema: {
        params: bikeIdParamsSchema,
        body: updateBikeRequestSchema,
        response: { 200: bikeResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const bike = await updateBike(
        app.db,
        request.user!.id,
        request.params.bikeId,
        request.body,
      );
      return reply.status(200).send({ bike });
    },
  );

  app.delete(
    '/me/bikes/:bikeId',
    { schema: { params: bikeIdParamsSchema }, preHandler: requireAuth },
    async (request, reply) => {
      await deleteBike(app.db, request.user!.id, request.params.bikeId);
      return reply.status(204).send();
    },
  );
};
