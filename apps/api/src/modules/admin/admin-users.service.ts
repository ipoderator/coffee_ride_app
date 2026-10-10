import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNotNull,
  isNull,
  or,
  type SQL,
} from 'drizzle-orm';
import type { DbClient } from 'db';
import {
  organizerProfiles,
  platformAdmins,
  registrations,
  reviews,
  rides,
  sessions,
  users,
} from 'db/schema';
import type {
  AdminUserDetail,
  AdminUserListItem,
  ListAdminUsersQuery,
  ListAdminUsersResponse,
} from 'types';
import { clampLimit } from '../../lib/cursor.js';
import {
  markEmailVerified,
  resendEmailVerification,
  setUserBlocked,
} from '../auth/auth.service.js';
import { revokeAllSessions } from '../auth/session.js';
import {
  USER_NOT_FOUND,
  conflict,
  containsPattern,
  createdBeforeCursor,
  recordAdminAction,
  toPage,
} from './admin-common.js';

// CR-229/CR-230 (ADR-032): the admin's view of users. Reads are an admin read model
// over `users` + joins; every mutation goes through the owning module's function
// (`auth.service.ts`/`session.ts`) and writes its `admin_actions` row in the same
// transaction. Never selects `password_hash`, `phone` or a session token.

const listColumns = {
  id: users.id,
  email: users.email,
  displayName: users.displayName,
  emailVerified: users.emailVerified,
  createdAt: users.createdAt,
  blockedAt: users.blockedAt,
  organizerId: organizerProfiles.id,
  adminUserId: platformAdmins.userId,
};

type ListRow = {
  id: string;
  email: string;
  displayName: string | null;
  emailVerified: boolean;
  createdAt: Date;
  blockedAt: Date | null;
  organizerId: string | null;
  adminUserId: string | null;
};

function toListItem(row: ListRow): AdminUserListItem {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    emailVerified: row.emailVerified,
    createdAt: row.createdAt.toISOString(),
    blockedAt: row.blockedAt?.toISOString() ?? null,
    isOrganizer: row.organizerId !== null,
    isAdmin: row.adminUserId !== null,
  };
}

export async function listAdminUsers(
  db: DbClient,
  query: ListAdminUsersQuery,
): Promise<ListAdminUsersResponse> {
  const limit = clampLimit(query.limit);
  const conditions: Array<SQL | undefined> = [
    createdBeforeCursor(query.cursor, users.createdAt, users.id),
  ];
  if (query.q) {
    const pattern = containsPattern(query.q);
    conditions.push(
      or(ilike(users.email, pattern), ilike(users.displayName, pattern)),
    );
  }
  if (query.filter === 'unverified') {
    conditions.push(eq(users.emailVerified, false));
  } else if (query.filter === 'blocked') {
    conditions.push(isNotNull(users.blockedAt));
  } else if (query.filter === 'organizers') {
    conditions.push(isNotNull(organizerProfiles.id));
  }

  const rows = await db
    .select(listColumns)
    .from(users)
    .leftJoin(organizerProfiles, eq(organizerProfiles.userId, users.id))
    .leftJoin(platformAdmins, eq(platformAdmins.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(limit + 1);

  return toPage(rows, limit, toListItem);
}

export async function getAdminUser(
  db: DbClient,
  userId: string,
): Promise<AdminUserDetail> {
  const [row] = await db
    .select({
      ...listColumns,
      firstName: users.firstName,
      lastName: users.lastName,
      blockReason: users.blockReason,
      organizerName: organizerProfiles.name,
    })
    .from(users)
    .leftJoin(organizerProfiles, eq(organizerProfiles.userId, users.id))
    .leftJoin(platformAdmins, eq(platformAdmins.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw USER_NOT_FOUND();

  const now = new Date();
  const [sessionCount, rideCount, registrationCount, reviewCount] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(sessions)
        .where(
          and(
            eq(sessions.userId, userId),
            gt(sessions.expiresAt, now),
            isNull(sessions.revokedAt),
          ),
        ),
      row.organizerId
        ? db
            .select({ value: count() })
            .from(rides)
            .where(eq(rides.organizerId, row.organizerId))
        : Promise.resolve([{ value: 0 }]),
      db
        .select({ value: count() })
        .from(registrations)
        .where(
          and(
            eq(registrations.userId, userId),
            eq(registrations.status, 'active'),
          ),
        ),
      db
        .select({ value: count() })
        .from(reviews)
        .where(eq(reviews.userId, userId)),
    ]);

  return {
    ...toListItem(row),
    firstName: row.firstName,
    lastName: row.lastName,
    blockReason: row.blockReason,
    organizer:
      row.organizerId && row.organizerName
        ? { id: row.organizerId, name: row.organizerName }
        : null,
    activeSessions: sessionCount[0]?.value ?? 0,
    ridesOrganized: rideCount[0]?.value ?? 0,
    activeRegistrations: registrationCount[0]?.value ?? 0,
    reviewsWritten: reviewCount[0]?.value ?? 0,
  };
}

async function assertUserExists(db: DbClient, userId: string) {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw USER_NOT_FOUND();
}

export async function adminVerifyUserEmail(
  db: DbClient,
  adminUserId: string,
  userId: string,
): Promise<AdminUserDetail> {
  await assertUserExists(db, userId);
  await db.transaction(async (tx) => {
    if (!(await markEmailVerified(tx, userId))) {
      throw conflict(
        'user_already_verified',
        'This email is already verified.',
      );
    }
    await recordAdminAction(tx, {
      adminUserId,
      action: 'user_email_verified',
      targetType: 'user',
      targetId: userId,
    });
  });
  return getAdminUser(db, userId);
}

/**
 * Issues a fresh verification link (the same rotation as the user's own
 * `/resend-verification`) and returns it with the address for the route to mail.
 * The audit row follows the token's own transaction rather than sharing it — a
 * resend changes no account state, only which link works.
 */
export async function adminIssueVerificationLink(
  db: DbClient,
  adminUserId: string,
  userId: string,
): Promise<{ email: string; verificationToken: string }> {
  const [row] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!row) throw USER_NOT_FOUND();

  const result = await resendEmailVerification(db, userId);
  if (!result.issued || !result.verificationToken) {
    throw conflict('user_already_verified', 'This email is already verified.');
  }
  await recordAdminAction(db, {
    adminUserId,
    action: 'user_verification_resent',
    targetType: 'user',
    targetId: userId,
  });
  return { email: row.email, verificationToken: result.verificationToken };
}

export async function adminRevokeUserSessions(
  db: DbClient,
  adminUserId: string,
  userId: string,
): Promise<number> {
  await assertUserExists(db, userId);
  return db.transaction(async (tx) => {
    const revoked = await revokeAllSessions(tx, userId);
    await recordAdminAction(tx, {
      adminUserId,
      action: 'user_sessions_revoked',
      targetType: 'user',
      targetId: userId,
    });
    return revoked;
  });
}

export async function adminBlockUser(
  db: DbClient,
  adminUserId: string,
  userId: string,
  reason: string,
): Promise<AdminUserDetail> {
  await assertUserExists(db, userId);
  // An admin can't be blocked from the panel — that includes the caller, so the
  // owner can never lock themself out by a misclick. Revoke the capability from
  // the host CLI first.
  const [admin] = await db
    .select({ userId: platformAdmins.userId })
    .from(platformAdmins)
    .where(eq(platformAdmins.userId, userId))
    .limit(1);
  if (admin) {
    throw conflict('cannot_block_admin', 'An admin account cannot be blocked.');
  }

  await db.transaction(async (tx) => {
    if (!(await setUserBlocked(tx, userId, adminUserId, reason))) {
      throw conflict('user_already_blocked', 'This user is already blocked.');
    }
    await recordAdminAction(tx, {
      adminUserId,
      action: 'user_blocked',
      targetType: 'user',
      targetId: userId,
      reason,
    });
  });
  return getAdminUser(db, userId);
}

export async function adminUnblockUser(
  db: DbClient,
  adminUserId: string,
  userId: string,
): Promise<AdminUserDetail> {
  await assertUserExists(db, userId);
  await db.transaction(async (tx) => {
    if (!(await setUserBlocked(tx, userId, adminUserId, null))) {
      throw conflict('user_not_blocked', 'This user is not blocked.');
    }
    await recordAdminAction(tx, {
      adminUserId,
      action: 'user_unblocked',
      targetType: 'user',
      targetId: userId,
    });
  });
  return getAdminUser(db, userId);
}
