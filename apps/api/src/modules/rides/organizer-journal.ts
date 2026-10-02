import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DbClient } from 'db';
import { rides } from 'db/schema';
import {
  ORGANIZER_JOURNAL_MIN_CLOSED_RIDES,
  type BicycleType,
  type OrganizerJournal,
} from 'types';

/**
 * CR-173 («Журнал организатора»): plain facts about one organizer's past rides,
 * for the ride page. Counts only `finished`/`cancelled` rides — a draft, or a
 * ride still ahead, says nothing about how this organizer rides. Two aggregate
 * queries (counts + medians, then bike types), run only for `GET /v1/rides/:id`.
 *
 * Medians, not averages: one 200 km outlier must not redefine «typical». A
 * figure resting on too little (`completionPercent` under
 * {@link ORGANIZER_JOURNAL_MIN_CLOSED_RIDES} closed rides) stays `null`.
 */
export async function getOrganizerJournal(
  db: DbClient,
  organizerProfileId: string,
): Promise<OrganizerJournal> {
  const [row] = await db
    .select({
      finished: sql<number>`count(*) filter (where ${rides.status} = 'finished')::int`,
      cancelled: sql<number>`count(*) filter (where ${rides.status} = 'cancelled')::int`,
      pace: sql<
        number | null
      >`(percentile_cont(0.5) within group (order by ${rides.paceKmh}) filter (where ${rides.status} = 'finished'))::float`,
      distance: sql<
        number | null
      >`(percentile_cont(0.5) within group (order by ${rides.distanceKm}) filter (where ${rides.status} = 'finished'))::float`,
    })
    .from(rides)
    .where(
      and(
        eq(rides.organizerId, organizerProfileId),
        inArray(rides.status, ['finished', 'cancelled']),
      ),
    );

  const finishedCount = row?.finished ?? 0;
  const cancelledCount = row?.cancelled ?? 0;
  const closed = finishedCount + cancelledCount;

  const typeRows =
    finishedCount > 0
      ? await db
          .select({
            type: rides.bicycleType,
            count: sql<number>`count(*)::int`,
          })
          .from(rides)
          .where(
            and(
              eq(rides.organizerId, organizerProfileId),
              eq(rides.status, 'finished'),
            ),
          )
          .groupBy(rides.bicycleType)
      : [];
  const bicycleTypes: BicycleType[] = typeRows
    .filter((r) => r.type !== 'any')
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type))
    .slice(0, 2)
    .map((r) => r.type);

  const round1 = (n: number | null | undefined) =>
    n === null || n === undefined ? null : Math.round(n * 10) / 10;

  return {
    finishedCount,
    cancelledCount,
    completionPercent:
      closed >= ORGANIZER_JOURNAL_MIN_CLOSED_RIDES
        ? Math.round((finishedCount / closed) * 100)
        : null,
    typicalPaceKmh: round1(row?.pace),
    typicalDistanceKm: round1(row?.distance),
    bicycleTypes,
  };
}
