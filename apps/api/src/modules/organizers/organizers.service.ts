import { eq } from 'drizzle-orm';
import { organizerProfiles, users } from 'db/schema';
import type { DbClient } from 'db';
import type {
  CreateOrganizerProfileRequest,
  OrganizerProfile,
  UpdateOrganizerProfileRequest,
} from 'types';

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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
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
): Promise<OrganizerProfile> {
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
    return toPublicOrganizerProfile(inserted);
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
): Promise<OrganizerProfile> {
  const [row] = await db
    .select()
    .from(organizerProfiles)
    .where(eq(organizerProfiles.userId, userId))
    .limit(1);
  if (!row) {
    throw NOT_FOUND();
  }
  return toPublicOrganizerProfile(row);
}

/**
 * `patch` only contains keys the client actually sent (Zod's `.optional()` omits
 * absent keys) — same PATCH semantics as `modules/users`' `updateProfile`.
 */
export async function updateOrganizerProfile(
  db: DbClient,
  userId: string,
  patch: UpdateOrganizerProfileRequest,
): Promise<OrganizerProfile> {
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
  return toPublicOrganizerProfile(updated);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}
