import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users } from 'db/schema';
import type { DbClient } from 'db';
import type { AvatarResponse, UpdateProfileRequest, User } from 'types';
import { toPublicUser } from '../auth/auth.service.js';
import { ImageInvalidError, processImage } from '../../lib/image-processing.js';
import {
  ImageStorageError,
  deleteImageObject,
  downloadImageObject,
  uploadImageObject,
} from '../../lib/image-storage.js';
import type { S3Handle } from '../../plugins/s3.js';

// Domain error the route layer maps to RFC 9457 — same pattern as
// `OrganizerServiceError`/`RideServiceError` (`.claude/rules/backend.md`).
export class UserServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'UserServiceError';
  }
}

/**
 * Updates the caller's own profile fields. `userId` must come from the
 * verified session only (`plugins/auth.ts`'s `requireAuth`) — this function
 * has no ownership check of its own because there is no `:id` path param to
 * check against; "which row" is entirely determined by who is authenticated
 * (`.claude/rules/security.md`: never trust a client-supplied id — there
 * isn't one here at all).
 *
 * `patch` only contains keys the client actually sent (Zod's `.optional()`
 * omits absent keys from the parsed result rather than setting them to
 * `undefined`) — an empty patch is a no-op that still returns the current
 * user, not an error, matching ordinary PATCH semantics.
 */
export async function updateProfile(
  db: DbClient,
  userId: string,
  patch: UpdateProfileRequest,
): Promise<User> {
  if (Object.keys(patch).length === 0) {
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    if (!row) {
      throw new Error('Authenticated user row not found.');
    }
    return toPublicUser(row);
  }

  const [updated] = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning();
  if (!updated) {
    throw new Error('Authenticated user row not found.');
  }

  return toPublicUser(updated);
}

const AVATAR_MISSING = () =>
  new UserServiceError(
    'avatar_missing',
    400,
    'Avatar file missing',
    'No file was uploaded.',
  );

const AVATAR_INVALID = (detail: string) =>
  new UserServiceError('avatar_invalid', 400, 'Avatar invalid', detail);

const AVATAR_ALREADY_EXISTS = () =>
  new UserServiceError(
    'avatar_already_exists',
    409,
    'Avatar already exists',
    'An avatar already exists for this account. Use replace instead.',
  );

const AVATAR_NOT_FOUND = () =>
  new UserServiceError(
    'avatar_not_found',
    404,
    'Avatar not found',
    'No avatar exists for this account.',
  );

const AVATAR_STORAGE_UNAVAILABLE = () =>
  new UserServiceError(
    'avatar_storage_unavailable',
    503,
    'Avatar storage unavailable',
    'File storage is temporarily unavailable. Try again later.',
  );

// CR-097 (KI-023 remainder): always `/v1/users/me/avatar` — same reasoning as
// `toPublicUser`'s `avatarUrl` field (there is no `:id`-keyed variant).
const AVATAR_URL_PATH = '/v1/users/me/avatar';

async function processUploadedAvatar(buffer: Buffer) {
  try {
    return await processImage(buffer);
  } catch (err) {
    if (err instanceof ImageInvalidError) throw AVATAR_INVALID(err.message);
    throw err;
  }
}

/**
 * CR-097: validates, resizes, and stores a new avatar for the caller's own
 * account. `409 avatar_already_exists` if one is already present — use
 * {@link replaceAvatar} instead. Reuses `lib/image-processing.ts`/
 * `lib/image-storage.ts`, same as `rides.service.ts`'s cover image and
 * `organizers.service.ts`'s avatar.
 */
export async function uploadAvatar(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
  file: { buffer: Buffer } | null,
): Promise<AvatarResponse> {
  if (!file) {
    throw AVATAR_MISSING();
  }

  const [existing] = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (existing?.avatarKey) {
    throw AVATAR_ALREADY_EXISTS();
  }

  const processed = await processUploadedAvatar(file.buffer);
  const key = `avatars/users/${userId}/${randomUUID()}.${processed.ext}`;
  try {
    await uploadImageObject(s3, key, processed.buffer, processed.contentType);
  } catch (err) {
    if (err instanceof ImageStorageError) throw AVATAR_STORAGE_UNAVAILABLE();
    throw err;
  }

  await db
    .update(users)
    .set({
      avatarKey: key,
      avatarContentType: processed.contentType,
      avatarSizeBytes: processed.buffer.byteLength,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return { avatarUrl: AVATAR_URL_PATH };
}

/**
 * CR-097: replaces an existing avatar. `404 avatar_not_found` if none exists
 * yet. The old S3 object is deleted only after the DB row already points at
 * the new one, and only best-effort (`.claude/rules/resilience.md`).
 */
export async function replaceAvatar(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
  file: { buffer: Buffer } | null,
): Promise<AvatarResponse> {
  if (!file) {
    throw AVATAR_MISSING();
  }

  const [existing] = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing?.avatarKey) {
    throw AVATAR_NOT_FOUND();
  }

  const processed = await processUploadedAvatar(file.buffer);
  const key = `avatars/users/${userId}/${randomUUID()}.${processed.ext}`;
  try {
    await uploadImageObject(s3, key, processed.buffer, processed.contentType);
  } catch (err) {
    if (err instanceof ImageStorageError) throw AVATAR_STORAGE_UNAVAILABLE();
    throw err;
  }

  await db
    .update(users)
    .set({
      avatarKey: key,
      avatarContentType: processed.contentType,
      avatarSizeBytes: processed.buffer.byteLength,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  try {
    await deleteImageObject(s3, existing.avatarKey);
  } catch {
    // Best-effort — see the function's own doc comment.
  }

  return { avatarUrl: AVATAR_URL_PATH };
}

/**
 * CR-097: removes the caller's own avatar. `404 avatar_not_found` if none
 * exists. The DB row is updated first — S3 cleanup is best-effort.
 */
export async function deleteAvatar(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
): Promise<void> {
  const [existing] = await db
    .select({ avatarKey: users.avatarKey })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!existing?.avatarKey) {
    throw AVATAR_NOT_FOUND();
  }

  await db
    .update(users)
    .set({
      avatarKey: null,
      avatarContentType: null,
      avatarSizeBytes: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  try {
    await deleteImageObject(s3, existing.avatarKey);
  } catch {
    // Best-effort — see `replaceAvatar`'s doc comment.
  }
}

/**
 * CR-097: streams the stored avatar back — the body behind `avatarUrl`.
 * "Me"-scoped and authenticated, same as every other function in this module —
 * unlike an organizer avatar, a participant's avatar has no established public
 * consumer today (`.claude/rules/security.md`: no endpoint exposes another
 * user's row), so this stays behind `requireAuth`, not a public `:id` route.
 */
export async function getAvatarDownload(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
): Promise<{ body: Buffer; contentType: string }> {
  const [row] = await db
    .select({
      avatarKey: users.avatarKey,
      avatarContentType: users.avatarContentType,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row?.avatarKey) {
    throw AVATAR_NOT_FOUND();
  }

  try {
    const downloaded = await downloadImageObject(s3, row.avatarKey);
    return {
      body: downloaded.body,
      contentType: row.avatarContentType ?? 'application/octet-stream',
    };
  } catch (err) {
    if (err instanceof ImageStorageError) throw AVATAR_STORAGE_UNAVAILABLE();
    throw err;
  }
}
