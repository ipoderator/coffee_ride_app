import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { updateProfileRequestSchema } from 'types';
import { requireAuth } from '../../plugins/auth.js';
import {
  readUploadedFile,
  UploadTooLargeError,
} from '../../lib/read-upload.js';
import { userResponseSchema } from './user-response.schema.js';
import {
  deleteAvatar,
  getAvatarDownload,
  replaceAvatar,
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
};
