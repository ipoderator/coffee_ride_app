import { randomUUID } from 'node:crypto';
import { and, asc, eq, ne, sql } from 'drizzle-orm';
import { users, userBikes } from 'db/schema';
import type { DbClient } from 'db';
import type {
  AvatarResponse,
  Bike,
  CreateBikeRequest,
  ListBikesResponse,
  ListRidesQuery,
  UpdateBikeRequest,
  UpdateProfileRequest,
  User,
} from 'types';
import { toPublicUser } from '../auth/auth.service.js';
import { ImageInvalidError, processImage } from '../../lib/image-processing.js';
import {
  ImageStorageError,
  deleteImageObject,
  downloadImageObject,
  uploadImageObject,
} from '../../lib/image-storage.js';
import type { S3Handle } from '../../plugins/s3.js';
import {
  CursorError,
  clampLimit,
  decodeCursor,
  encodeCursor,
} from '../../lib/cursor.js';

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

// CR-126 ("garage"): "me"-scoped CRUD, same ownership discipline as the avatar
// functions above — `userId` only ever comes from the verified session.

const BIKE_NOT_FOUND = () =>
  new UserServiceError(
    'bike_not_found',
    404,
    'Bike not found',
    'No bike with that id exists for this account.',
  );

// Sane cap against an unbounded garage, same tier as `ride-groups.service.ts`'s
// 6-per-ride limit — not a real-world constraint, just abuse resistance.
const BIKE_MAX_PER_USER = 20;

const BIKE_LIMIT_REACHED = () =>
  new UserServiceError(
    'bike_limit_reached',
    409,
    'Bike limit reached',
    `A profile can list at most ${BIKE_MAX_PER_USER} bikes.`,
  );

const INVALID_CURSOR = () =>
  new UserServiceError(
    'invalid_cursor',
    400,
    'Invalid cursor',
    'The cursor parameter is not a valid pagination cursor.',
  );

// Exported: `registrations.service.ts`'s `getRiderProfile` reuses this same
// row-to-`Bike` mapping for another user's garage — same "reuse a mapper across
// modules" precedent as `rides.service.ts`'s `toPublicRide`.
export function toBike(row: typeof userBikes.$inferSelect): Bike {
  return {
    id: row.id,
    // `row.bikeType`'s DB type is the full `bicycleTypeEnum` (includes `'any'`) —
    // narrower here because `createBike`/`updateBike` below never write `'any'`.
    bikeType: row.bikeType as Bike['bikeType'],
    brand: row.brand,
    model: row.model,
    isActive: row.isActive,
  };
}

/** Ascending `createdAt`/`id` cursor pagination — same shape as every other list. */
export async function listBikes(
  db: DbClient,
  userId: string,
  query: ListRidesQuery,
): Promise<ListBikesResponse> {
  const limit = clampLimit(query.limit);
  const conditions = [eq(userBikes.userId, userId)];
  if (query.cursor) {
    let cursorKey;
    try {
      cursorKey = decodeCursor(query.cursor);
    } catch (error) {
      if (error instanceof CursorError) throw INVALID_CURSOR();
      throw error;
    }
    conditions.push(
      sql`(date_trunc('milliseconds', ${userBikes.createdAt}), ${userBikes.id}) > (${cursorKey.sortValue}::timestamptz, ${cursorKey.id}::uuid)`,
    );
  }

  const rows = await db
    .select()
    .from(userBikes)
    .where(and(...conditions))
    .orderBy(asc(userBikes.createdAt), asc(userBikes.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last
      ? encodeCursor({ sortValue: last.createdAt.toISOString(), id: last.id })
      : null;

  return { items: page.map(toBike), nextCursor };
}

/**
 * `isActive: true` unsets any other active bike for this user inside the same
 * transaction — the DB-level partial unique index (`user_bikes_one_active_per_user`)
 * is the invariant backstop, not a path this code needs to catch a constraint
 * violation for (`.claude/rules/database.md`).
 */
export async function createBike(
  db: DbClient,
  userId: string,
  input: CreateBikeRequest,
): Promise<Bike> {
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userBikes)
    .where(eq(userBikes.userId, userId));
  if ((countRow?.count ?? 0) >= BIKE_MAX_PER_USER) {
    throw BIKE_LIMIT_REACHED();
  }

  const isActive = input.isActive ?? false;
  const row = await db.transaction(async (tx) => {
    if (isActive) {
      await tx
        .update(userBikes)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(userBikes.userId, userId), eq(userBikes.isActive, true)));
    }
    const [inserted] = await tx
      .insert(userBikes)
      .values({
        userId,
        bikeType: input.bikeType,
        brand: input.brand ?? null,
        model: input.model ?? null,
        isActive,
      })
      .returning();
    if (!inserted) {
      throw new Error('Bike insert returned no row.');
    }
    return inserted;
  });

  return toBike(row);
}

export async function updateBike(
  db: DbClient,
  userId: string,
  bikeId: string,
  patch: UpdateBikeRequest,
): Promise<Bike> {
  const [existing] = await db
    .select({ id: userBikes.id })
    .from(userBikes)
    .where(and(eq(userBikes.id, bikeId), eq(userBikes.userId, userId)))
    .limit(1);
  if (!existing) {
    throw BIKE_NOT_FOUND();
  }

  const row = await db.transaction(async (tx) => {
    if (patch.isActive === true) {
      await tx
        .update(userBikes)
        .set({ isActive: false, updatedAt: new Date() })
        .where(
          and(
            eq(userBikes.userId, userId),
            eq(userBikes.isActive, true),
            ne(userBikes.id, bikeId),
          ),
        );
    }
    const [updated] = await tx
      .update(userBikes)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(userBikes.id, bikeId))
      .returning();
    if (!updated) {
      throw new Error('Bike update returned no row.');
    }
    return updated;
  });

  return toBike(row);
}

export async function deleteBike(
  db: DbClient,
  userId: string,
  bikeId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: userBikes.id })
    .from(userBikes)
    .where(and(eq(userBikes.id, bikeId), eq(userBikes.userId, userId)))
    .limit(1);
  if (!existing) {
    throw BIKE_NOT_FOUND();
  }

  await db.delete(userBikes).where(eq(userBikes.id, bikeId));
}
