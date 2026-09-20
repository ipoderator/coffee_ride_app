import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { organizerProfiles, users } from 'db/schema';
import type { DbClient } from 'db';
import type {
  AvatarResponse,
  CreateOrganizerProfileRequest,
  OrganizerProfile,
  OrganizerProfileResponse,
  UpdateOrganizerProfileRequest,
} from 'types';
import { getOrganizerRatingSummary } from '../reviews/reviews.service.js';
import { ImageInvalidError, processImage } from '../../lib/image-processing.js';
import {
  ImageStorageError,
  deleteImageObject,
  downloadImageObject,
  uploadImageObject,
} from '../../lib/image-storage.js';
import type { S3Handle } from '../../plugins/s3.js';

// Domain error the route layer maps to RFC 9457 — same pattern as
// `AuthServiceError` (`.claude/rules/backend.md`: route -> validation -> service ->
// repository).
export class OrganizerServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly title: string,
    detail: string,
  ) {
    super(detail);
    this.name = 'OrganizerServiceError';
  }
}

function toPublicOrganizerProfile(
  row: typeof organizerProfiles.$inferSelect,
): OrganizerProfile {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatarKey ? organizerAvatarUrlPath(row.id) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// CR-097 (KI-023 remainder): public — an `OrganizerProfile` is already a public
// identity via `RideOrganizerSummary`, unlike a `Ride`'s draft-gated cover, so
// this path needs no viewer-visibility check the way `coverImageUrlPath`'s
// downstream route does.
export function organizerAvatarUrlPath(organizerId: string): string {
  return `/v1/organizers/${organizerId}/avatar`;
}

const ALREADY_EXISTS = () =>
  new OrganizerServiceError(
    'organizer_profile_already_exists',
    409,
    'Organizer profile already exists',
    'An organizer profile already exists for this account.',
  );

const NOT_FOUND = () =>
  new OrganizerServiceError(
    'organizer_profile_not_found',
    404,
    'Organizer profile not found',
    'No organizer profile exists for this account yet.',
  );

const EMAIL_VERIFICATION_REQUIRED = () =>
  new OrganizerServiceError(
    'email_verification_required',
    403,
    'Email verification required',
    'Verify your email before creating an organizer profile.',
  );

/**
 * Creates the caller's `OrganizerProfile`. `userId` must come from the verified
 * session only (`plugins/auth.ts`'s `requireAuth`) — there is no `:id` path param, so
 * "whose profile" is entirely determined by who is authenticated
 * (`.claude/rules/security.md`).
 *
 * Gates on `emailVerified` (`.claude/rules/security.md`: "Require a verified email
 * before an account can act as an organizer"; `packages/db/src/schema/user.ts`'s own
 * comment already commits to this starting here). Checked against a fresh row read
 * inside this call, not a value passed in from the route, so it reflects the current
 * DB state rather than whatever `request.user` captured at session-validation time.
 */
export async function createOrganizerProfile(
  db: DbClient,
  userId: string,
  input: CreateOrganizerProfileRequest,
): Promise<OrganizerProfileResponse> {
  const [userRow] = await db
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!userRow) {
    throw new Error('Authenticated user row not found.');
  }
  if (!userRow.emailVerified) {
    throw EMAIL_VERIFICATION_REQUIRED();
  }

  const existing = await db
    .select({ id: organizerProfiles.id })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.userId, userId))
    .limit(1);
  if (existing.length > 0) {
    throw ALREADY_EXISTS();
  }

  try {
    const [inserted] = await db
      .insert(organizerProfiles)
      .values({
        userId,
        name: input.name,
        description: input.description ?? null,
      })
      .returning();
    if (!inserted) {
      throw new Error('Organizer profile insert returned no row.');
    }
    // A brand-new profile has no rides/reviews yet — skip the aggregate query
    // rather than run it against a profile that cannot possibly have any.
    return {
      organizerProfile: toPublicOrganizerProfile(inserted),
      rating: null,
      reviewCount: 0,
    };
  } catch (error) {
    // Race: two concurrent creates for the same user both pass the pre-check above.
    // The table's unique index (`organizer_profiles_user_id_unique`) is the real
    // guard — surface it as the same domain error, not a raw constraint message
    // (`.claude/rules/backend.md`).
    if (isUniqueViolation(error)) {
      throw ALREADY_EXISTS();
    }
    throw error;
  }
}

export async function getOwnOrganizerProfile(
  db: DbClient,
  userId: string,
): Promise<OrganizerProfileResponse> {
  const [row] = await db
    .select()
    .from(organizerProfiles)
    .where(eq(organizerProfiles.userId, userId))
    .limit(1);
  if (!row) {
    throw NOT_FOUND();
  }
  const { rating, reviewCount } = await getOrganizerRatingSummary(db, row.id);
  return {
    organizerProfile: toPublicOrganizerProfile(row),
    rating,
    reviewCount,
  };
}

/**
 * `patch` only contains keys the client actually sent (Zod's `.optional()` omits
 * absent keys) — same PATCH semantics as `modules/users`' `updateProfile`.
 */
export async function updateOrganizerProfile(
  db: DbClient,
  userId: string,
  patch: UpdateOrganizerProfileRequest,
): Promise<OrganizerProfileResponse> {
  const existing = await db
    .select({ id: organizerProfiles.id })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.userId, userId))
    .limit(1);
  if (existing.length === 0) {
    throw NOT_FOUND();
  }

  if (Object.keys(patch).length === 0) {
    return getOwnOrganizerProfile(db, userId);
  }

  const [updated] = await db
    .update(organizerProfiles)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(organizerProfiles.userId, userId))
    .returning();
  if (!updated) {
    throw new Error('Organizer profile update returned no row.');
  }
  const { rating, reviewCount } = await getOrganizerRatingSummary(
    db,
    updated.id,
  );
  return {
    organizerProfile: toPublicOrganizerProfile(updated),
    rating,
    reviewCount,
  };
}

const AVATAR_MISSING = () =>
  new OrganizerServiceError(
    'avatar_missing',
    400,
    'Avatar file missing',
    'No file was uploaded.',
  );

const AVATAR_INVALID = (detail: string) =>
  new OrganizerServiceError('avatar_invalid', 400, 'Avatar invalid', detail);

const AVATAR_ALREADY_EXISTS = () =>
  new OrganizerServiceError(
    'avatar_already_exists',
    409,
    'Avatar already exists',
    'An avatar already exists for this organizer profile. Use replace instead.',
  );

const AVATAR_NOT_FOUND = () =>
  new OrganizerServiceError(
    'avatar_not_found',
    404,
    'Avatar not found',
    'No avatar exists for this organizer profile.',
  );

const AVATAR_STORAGE_UNAVAILABLE = () =>
  new OrganizerServiceError(
    'avatar_storage_unavailable',
    503,
    'Avatar storage unavailable',
    'File storage is temporarily unavailable. Try again later.',
  );

async function resolveOwnOrganizerProfileId(
  db: DbClient,
  userId: string,
): Promise<string> {
  const [row] = await db
    .select({ id: organizerProfiles.id })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.userId, userId))
    .limit(1);
  if (!row) {
    throw NOT_FOUND();
  }
  return row.id;
}

async function processUploadedAvatar(buffer: Buffer) {
  try {
    return await processImage(buffer);
  } catch (err) {
    if (err instanceof ImageInvalidError) throw AVATAR_INVALID(err.message);
    throw err;
  }
}

/**
 * CR-097 (KI-023 remainder): validates, resizes, and stores a new avatar for the
 * caller's own `OrganizerProfile`. `409 avatar_already_exists` if one is already
 * present — use {@link replaceOrganizerAvatar} instead. Same reuse of
 * `lib/image-processing.ts`/`lib/image-storage.ts` as `rides.service.ts`'s cover
 * image, no ride-style draft gate (an organizer profile has no draft state).
 */
export async function uploadOrganizerAvatar(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
  file: { buffer: Buffer } | null,
): Promise<AvatarResponse> {
  if (!file) {
    throw AVATAR_MISSING();
  }
  const organizerId = await resolveOwnOrganizerProfileId(db, userId);

  const [existing] = await db
    .select({ avatarKey: organizerProfiles.avatarKey })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.id, organizerId))
    .limit(1);
  if (existing?.avatarKey) {
    throw AVATAR_ALREADY_EXISTS();
  }

  const processed = await processUploadedAvatar(file.buffer);
  const key = `avatars/organizers/${organizerId}/${randomUUID()}.${processed.ext}`;
  try {
    await uploadImageObject(s3, key, processed.buffer, processed.contentType);
  } catch (err) {
    if (err instanceof ImageStorageError) throw AVATAR_STORAGE_UNAVAILABLE();
    throw err;
  }

  await db
    .update(organizerProfiles)
    .set({
      avatarKey: key,
      avatarContentType: processed.contentType,
      avatarSizeBytes: processed.buffer.byteLength,
      updatedAt: new Date(),
    })
    .where(eq(organizerProfiles.id, organizerId));

  return { avatarUrl: organizerAvatarUrlPath(organizerId) };
}

/**
 * CR-097: replaces an existing avatar. `404 avatar_not_found` if none exists yet.
 * The old S3 object is deleted only after the DB row already points at the new
 * one, and only best-effort (`.claude/rules/resilience.md`).
 */
export async function replaceOrganizerAvatar(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
  file: { buffer: Buffer } | null,
): Promise<AvatarResponse> {
  if (!file) {
    throw AVATAR_MISSING();
  }
  const organizerId = await resolveOwnOrganizerProfileId(db, userId);

  const [existing] = await db
    .select({ avatarKey: organizerProfiles.avatarKey })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.id, organizerId))
    .limit(1);
  if (!existing?.avatarKey) {
    throw AVATAR_NOT_FOUND();
  }

  const processed = await processUploadedAvatar(file.buffer);
  const key = `avatars/organizers/${organizerId}/${randomUUID()}.${processed.ext}`;
  try {
    await uploadImageObject(s3, key, processed.buffer, processed.contentType);
  } catch (err) {
    if (err instanceof ImageStorageError) throw AVATAR_STORAGE_UNAVAILABLE();
    throw err;
  }

  await db
    .update(organizerProfiles)
    .set({
      avatarKey: key,
      avatarContentType: processed.contentType,
      avatarSizeBytes: processed.buffer.byteLength,
      updatedAt: new Date(),
    })
    .where(eq(organizerProfiles.id, organizerId));

  try {
    await deleteImageObject(s3, existing.avatarKey);
  } catch {
    // Best-effort — see the function's own doc comment.
  }

  return { avatarUrl: organizerAvatarUrlPath(organizerId) };
}

/**
 * CR-097: removes the caller's own avatar. `404 avatar_not_found` if none
 * exists. The DB row is updated first — S3 cleanup is best-effort.
 */
export async function deleteOrganizerAvatar(
  db: DbClient,
  s3: S3Handle | null,
  userId: string,
): Promise<void> {
  const organizerId = await resolveOwnOrganizerProfileId(db, userId);

  const [existing] = await db
    .select({ avatarKey: organizerProfiles.avatarKey })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.id, organizerId))
    .limit(1);
  if (!existing?.avatarKey) {
    throw AVATAR_NOT_FOUND();
  }

  await db
    .update(organizerProfiles)
    .set({
      avatarKey: null,
      avatarContentType: null,
      avatarSizeBytes: null,
      updatedAt: new Date(),
    })
    .where(eq(organizerProfiles.id, organizerId));

  try {
    await deleteImageObject(s3, existing.avatarKey);
  } catch {
    // Best-effort — see `replaceOrganizerAvatar`'s doc comment.
  }
}

/**
 * CR-097: streams the stored avatar back — the body behind `avatarUrl`. Public,
 * no ownership/visibility check (an organizer's identity, including its avatar,
 * is already public via `RideOrganizerSummary`) — `organizerId` here is a
 * client-supplied path param precisely because this is meant to be readable by
 * anyone, unlike every other function in this module.
 */
export async function getOrganizerAvatarDownload(
  db: DbClient,
  s3: S3Handle | null,
  organizerId: string,
): Promise<{ body: Buffer; contentType: string }> {
  const [row] = await db
    .select({
      avatarKey: organizerProfiles.avatarKey,
      avatarContentType: organizerProfiles.avatarContentType,
    })
    .from(organizerProfiles)
    .where(eq(organizerProfiles.id, organizerId))
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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
