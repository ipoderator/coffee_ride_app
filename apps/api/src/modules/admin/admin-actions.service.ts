import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbClient } from 'db';
import { adminActions, reviews, rides, users } from 'db/schema';
import type { ListAdminActionsQuery, ListAdminActionsResponse } from 'types';
import { clampLimit } from '../../lib/cursor.js';
import { createdBeforeCursor, toPage } from './admin-common.js';

// CR-229 (ADR-032): the append-only admin log, newest first. Each row's target is
// labelled with its *current* email/title (a review by its ride's title) — read at
// list time, never copied into the log.

const actingAdmin = alias(users, 'acting_admin');

const targetLabel = sql<string | null>`case ${adminActions.targetType}
  when 'user' then (select ${users.email} from ${users} where ${users.id} = ${adminActions.targetId})
  when 'ride' then (select ${rides.title} from ${rides} where ${rides.id} = ${adminActions.targetId})
  when 'review' then (
    select ${rides.title} from ${reviews}
    join ${rides} on ${rides.id} = ${reviews.rideId}
    where ${reviews.id} = ${adminActions.targetId}
  )
end`;

export async function listAdminActions(
  db: DbClient,
  query: ListAdminActionsQuery,
): Promise<ListAdminActionsResponse> {
  const limit = clampLimit(query.limit);
  const conditions: Array<SQL | undefined> = [
    createdBeforeCursor(query.cursor, adminActions.createdAt, adminActions.id),
  ];
  if (query.targetType) {
    conditions.push(eq(adminActions.targetType, query.targetType));
  }
  if (query.targetId) {
    conditions.push(eq(adminActions.targetId, query.targetId));
  }
  if (query.action) {
    conditions.push(eq(adminActions.action, query.action));
  }

  const rows = await db
    .select({
      id: adminActions.id,
      action: adminActions.action,
      targetType: adminActions.targetType,
      targetId: adminActions.targetId,
      targetLabel,
      reason: adminActions.reason,
      createdAt: adminActions.createdAt,
      adminId: actingAdmin.id,
      adminEmail: actingAdmin.email,
    })
    .from(adminActions)
    .leftJoin(actingAdmin, eq(actingAdmin.id, adminActions.adminUserId))
    .where(and(...conditions))
    .orderBy(desc(adminActions.createdAt), desc(adminActions.id))
    .limit(limit + 1);

  return toPage(rows, limit, (row) => ({
    id: row.id,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    targetLabel: row.targetLabel,
    reason: row.reason,
    createdAt: row.createdAt.toISOString(),
    admin:
      row.adminId && row.adminEmail
        ? { id: row.adminId, email: row.adminEmail }
        : null,
  }));
}
