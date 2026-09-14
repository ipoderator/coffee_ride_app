import { eq } from 'drizzle-orm';
import { users } from 'db/schema';
import type { DbClient } from 'db';
import type { UpdateProfileRequest, User } from 'types';
import { toPublicUser } from '../auth/auth.service.js';

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
