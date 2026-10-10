import { asc, eq } from 'drizzle-orm';
import type { DbClient } from './client.js';
import { adminActions, platformAdmins, users } from './schema/index.js';

// CR-228 (ADR-032): the only code that grants or revokes the platform-admin
// capability. Run from the host CLI (`admin-cli.ts`), never over HTTP — there is no
// endpoint that makes someone an admin. Each change writes its `admin_actions` row
// in the same transaction, with `adminUserId` null: the CLI has no session user, and
// shell access to the host is the authority here.
//
// CR-232: only an account with a confirmed email can be made an admin — an
// unconfirmed address may not belong to whoever registered it. This gates the grant
// only; an admin row that already exists keeps working (no runtime check).

export type GrantAdminResult =
  'granted' | 'already_admin' | 'user_not_found' | 'email_not_verified';
export type RevokeAdminResult = 'revoked' | 'not_admin' | 'user_not_found';

async function findUser(db: DbClient, email: string) {
  const [row] = await db
    .select({ id: users.id, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return row;
}

export async function grantAdmin(
  db: DbClient,
  email: string,
): Promise<GrantAdminResult> {
  const user = await findUser(db, email);
  if (!user) return 'user_not_found';
  if (!user.emailVerified) return 'email_not_verified';
  const userId = user.id;

  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(platformAdmins)
      .values({ userId })
      .onConflictDoNothing()
      .returning({ userId: platformAdmins.userId });
    if (inserted.length === 0) return 'already_admin';

    await tx.insert(adminActions).values({
      adminUserId: null,
      action: 'admin_granted',
      targetType: 'user',
      targetId: userId,
    });
    return 'granted';
  });
}

export async function revokeAdmin(
  db: DbClient,
  email: string,
): Promise<RevokeAdminResult> {
  const userId = (await findUser(db, email))?.id;
  if (!userId) return 'user_not_found';

  return db.transaction(async (tx) => {
    const deleted = await tx
      .delete(platformAdmins)
      .where(eq(platformAdmins.userId, userId))
      .returning({ userId: platformAdmins.userId });
    if (deleted.length === 0) return 'not_admin';

    await tx.insert(adminActions).values({
      adminUserId: null,
      action: 'admin_revoked',
      targetType: 'user',
      targetId: userId,
    });
    return 'revoked';
  });
}

export async function listAdmins(db: DbClient) {
  return db
    .select({ email: users.email, grantedAt: platformAdmins.grantedAt })
    .from(platformAdmins)
    .innerJoin(users, eq(users.id, platformAdmins.userId))
    .orderBy(asc(platformAdmins.grantedAt));
}
