import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  organizerProfiles,
  registrations,
  reviews,
  rides,
  users,
} from 'db/schema';
import { RIDE_STATUSES, type AdminOverview, type RideStatus } from 'types';
import { checkDependencies } from '../../routes/health.js';

// CR-229 (ADR-032): the admin's one-glance numbers plus the same dependency
// checks `GET /health` runs. Five aggregate queries in parallel — no per-row work.

const DAY_MS = 24 * 60 * 60 * 1000;

export async function getAdminOverview(
  app: FastifyInstance,
): Promise<AdminOverview> {
  const { db } = app;
  const now = new Date();
  // Bound as ISO strings: a raw `sql` template hands a `Date` to postgres.js
  // untyped, which it refuses to serialize.
  const nowIso = sql`${now.toISOString()}::timestamptz`;
  const weekAgo = sql`${new Date(now.getTime() - 7 * DAY_MS).toISOString()}::timestamptz`;
  const weekAhead = sql`${new Date(now.getTime() + 7 * DAY_MS).toISOString()}::timestamptz`;

  const [
    [userCounts],
    [organizerCounts],
    rideStatusRows,
    [rideCounts],
    [registrationCounts],
    [reviewCounts],
    dependencies,
  ] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        newLast7Days: sql<number>`count(*) filter (where ${users.createdAt} >= ${weekAgo})::int`,
        unverified: sql<number>`count(*) filter (where not ${users.emailVerified})::int`,
        blocked: sql<number>`count(*) filter (where ${users.blockedAt} is not null)::int`,
      })
      .from(users),
    db.select({ total: sql<number>`count(*)::int` }).from(organizerProfiles),
    db
      .select({ status: rides.status, count: sql<number>`count(*)::int` })
      .from(rides)
      .groupBy(rides.status),
    db
      .select({
        hidden: sql<number>`count(*) filter (where ${rides.hiddenAt} is not null)::int`,
        upcomingNext7Days: sql<number>`count(*) filter (where ${rides.startsAt} >= ${nowIso} and ${rides.startsAt} < ${weekAhead} and ${rides.status} not in ('draft', 'cancelled'))::int`,
      })
      .from(rides),
    db
      .select({
        active: sql<number>`count(*) filter (where ${registrations.status} = 'active')::int`,
        newLast7Days: sql<number>`count(*) filter (where ${registrations.createdAt} >= ${weekAgo})::int`,
      })
      .from(registrations),
    db
      .select({
        total: sql<number>`count(*)::int`,
        hidden: sql<number>`count(*) filter (where ${reviews.hiddenAt} is not null)::int`,
      })
      .from(reviews),
    checkDependencies(app),
  ]);

  const byStatus = Object.fromEntries(
    RIDE_STATUSES.map((status) => [status, 0]),
  ) as Record<RideStatus, number>;
  for (const row of rideStatusRows) byStatus[row.status] = row.count;

  return {
    users: {
      total: userCounts?.total ?? 0,
      newLast7Days: userCounts?.newLast7Days ?? 0,
      unverified: userCounts?.unverified ?? 0,
      blocked: userCounts?.blocked ?? 0,
    },
    organizers: { total: organizerCounts?.total ?? 0 },
    rides: {
      byStatus,
      hidden: rideCounts?.hidden ?? 0,
      upcomingNext7Days: rideCounts?.upcomingNext7Days ?? 0,
    },
    registrations: {
      active: registrationCounts?.active ?? 0,
      newLast7Days: registrationCounts?.newLast7Days ?? 0,
    },
    reviews: {
      total: reviewCounts?.total ?? 0,
      hidden: reviewCounts?.hidden ?? 0,
    },
    dependencies: {
      database: dependencies.db,
      redis: dependencies.redis,
      s3: dependencies.s3,
      email: app.emailProvider ? 'ok' : 'not_configured',
      maps: app.mapProvider ? 'ok' : 'not_configured',
    },
  };
}
