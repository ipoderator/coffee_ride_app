import {
  and,
  desc,
  eq,
  ilike,
  isNotNull,
  isNull,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { DbClient } from 'db';
import { organizerProfiles, registrations, rides } from 'db/schema';
import type {
  AdminRideListItem,
  ListAdminRidesQuery,
  ListAdminRidesResponse,
  RideStatus,
} from 'types';
import { clampLimit } from '../../lib/cursor.js';
import type {
  NotificationLogger,
  NotificationQueue,
} from '../notifications/notifications.service.js';
import {
  commitRideCancellation,
  setRideHidden,
} from '../rides/rides.service.js';
import {
  RIDE_NOT_FOUND,
  conflict,
  containsPattern,
  createdBeforeCursor,
  recordAdminAction,
  toPage,
} from './admin-common.js';

// CR-229/CR-230 (ADR-032): every ride on the platform, drafts included, for the
// admin. Hide/unhide and cancel go through `rides.service.ts`; each writes its
// `admin_actions` row in the same transaction.

const activeRegistrations = sql<number>`(
  select count(*)::int from ${registrations}
  where ${registrations.rideId} = ${rides.id} and ${registrations.status} = 'active'
)`;

const columns = {
  id: rides.id,
  title: rides.title,
  status: rides.status,
  startsAt: rides.startsAt,
  timezone: rides.startTimezone,
  createdAt: rides.createdAt,
  organizerId: organizerProfiles.id,
  organizerName: organizerProfiles.name,
  organizerUserId: organizerProfiles.userId,
  activeRegistrations,
  hiddenAt: rides.hiddenAt,
  hiddenReason: rides.hiddenReason,
};

type Row = {
  id: string;
  title: string;
  status: RideStatus;
  startsAt: Date;
  timezone: string;
  createdAt: Date;
  organizerId: string;
  organizerName: string;
  organizerUserId: string;
  activeRegistrations: number;
  hiddenAt: Date | null;
  hiddenReason: string | null;
};

function toItem(row: Row): AdminRideListItem {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    timezone: row.timezone,
    createdAt: row.createdAt.toISOString(),
    organizer: {
      id: row.organizerId,
      name: row.organizerName,
      userId: row.organizerUserId,
    },
    activeRegistrations: row.activeRegistrations,
    hiddenAt: row.hiddenAt?.toISOString() ?? null,
    hiddenReason: row.hiddenReason,
  };
}

function selectRides(db: DbClient) {
  return db
    .select(columns)
    .from(rides)
    .innerJoin(organizerProfiles, eq(rides.organizerId, organizerProfiles.id));
}

export async function listAdminRides(
  db: DbClient,
  query: ListAdminRidesQuery,
): Promise<ListAdminRidesResponse> {
  const limit = clampLimit(query.limit);
  const conditions: Array<SQL | undefined> = [
    createdBeforeCursor(query.cursor, rides.createdAt, rides.id),
  ];
  if (query.q) {
    conditions.push(ilike(rides.title, containsPattern(query.q)));
  }
  if (query.status) {
    conditions.push(eq(rides.status, query.status));
  }
  if (query.visibility === 'hidden') {
    conditions.push(isNotNull(rides.hiddenAt));
  } else if (query.visibility === 'visible') {
    conditions.push(isNull(rides.hiddenAt));
  }

  const rows = await selectRides(db)
    .where(and(...conditions))
    .orderBy(desc(rides.createdAt), desc(rides.id))
    .limit(limit + 1);

  return toPage(rows, limit, toItem);
}

export async function getAdminRide(
  db: DbClient,
  rideId: string,
): Promise<AdminRideListItem> {
  const [row] = await selectRides(db).where(eq(rides.id, rideId)).limit(1);
  if (!row) throw RIDE_NOT_FOUND();
  return toItem(row);
}

export async function adminSetRideHidden(
  db: DbClient,
  adminUserId: string,
  rideId: string,
  reason: string | null,
): Promise<AdminRideListItem> {
  await getAdminRide(db, rideId);
  await db.transaction(async (tx) => {
    if (!(await setRideHidden(tx, rideId, adminUserId, reason))) {
      throw reason === null
        ? conflict('ride_not_hidden', 'This ride is not hidden.')
        : conflict('ride_already_hidden', 'This ride is already hidden.');
    }
    await recordAdminAction(tx, {
      adminUserId,
      action: reason === null ? 'ride_unhidden' : 'ride_hidden',
      targetType: 'ride',
      targetId: rideId,
      reason,
    });
  });
  return getAdminRide(db, rideId);
}

/**
 * Cancels any organizer's ride through the organizer path's own cancellation
 * (status guard, `updatedBy`, participant notifications after commit) —
 * `409 ride_not_cancellable` for a draft/started/finished/cancelled ride alike.
 */
export async function adminCancelRide(
  db: DbClient,
  logger: NotificationLogger,
  queue: NotificationQueue | null,
  adminUserId: string,
  rideId: string,
  reason: string,
): Promise<AdminRideListItem> {
  await commitRideCancellation(db, logger, queue, adminUserId, rideId, (tx) =>
    recordAdminAction(tx, {
      adminUserId,
      action: 'ride_cancelled',
      targetType: 'ride',
      targetId: rideId,
      reason,
    }),
  );
  return getAdminRide(db, rideId);
}
