import type { Ride, RideParticipantSummary } from 'types';
import { isRideOverdue } from '@/lib/rides/overdue';

const UPCOMING: ReadonlySet<Ride['status']> = new Set([
  'published',
  'registration_open',
  'registration_closed',
]);

/** Rides under way, oldest start first. */
export function liveRides(rides: Ride[]): Ride[] {
  return rides
    .filter((ride) => ride.status === 'started')
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Published rides whose start is still ahead, soonest first. */
export function upcomingRides(rides: Ride[], now: Date, max: number): Ride[] {
  return rides
    .filter(
      (ride) =>
        UPCOMING.has(ride.status) &&
        new Date(ride.startsAt).getTime() > now.getTime(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .slice(0, max);
}

/**
 * CR-184: rides still before `started` whose start time has passed — neither
 * upcoming nor live, so they need the organizer's decision. Oldest first.
 */
export function overdueRides(rides: Ride[], now: Date): Ride[] {
  return rides
    .filter((ride) => isRideOverdue(ride, now))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Riders whose outcome is settled: confirmed finish, dnf or no-show. */
export function resolvedCount(tally: FinishTally): number {
  return tally.confirmed + tally.dnf + tally.noShow;
}

export interface FinishTally {
  confirmed: number;
  claimed: number;
  onRoute: number;
  dnf: number;
  noShow: number;
}

/** Splits a ride's participants by where they are on the finish-control path. */
export function finishTally(items: RideParticipantSummary[]): FinishTally {
  const tally: FinishTally = {
    confirmed: 0,
    claimed: 0,
    onRoute: 0,
    dnf: 0,
    noShow: 0,
  };
  for (const item of items) {
    if (item.attendance === 'finished') tally.confirmed += 1;
    else if (item.attendance === 'dnf') tally.dnf += 1;
    else if (item.attendance === 'no_show') tally.noShow += 1;
    else if (item.finishClaimedAt !== null) tally.claimed += 1;
    else tally.onRoute += 1;
  }
  return tally;
}

export type RowState = 'claimed' | 'onRoute' | 'confirmed' | 'dnf';

/** The participant's row state, `null` for a no-show (not shown on the card). */
export function rowState(item: RideParticipantSummary): RowState | null {
  if (item.attendance === 'finished') return 'confirmed';
  if (item.attendance === 'dnf') return 'dnf';
  if (item.attendance === 'no_show') return null;
  return item.finishClaimedAt !== null ? 'claimed' : 'onRoute';
}

const ROW_ORDER: Record<RowState, number> = {
  claimed: 0,
  onRoute: 1,
  confirmed: 2,
  dnf: 3,
};

/** Rows to show on the card: claims waiting for the organizer first. */
export function previewRows(
  items: RideParticipantSummary[],
  max: number,
): { item: RideParticipantSummary; state: RowState }[] {
  const rows: { item: RideParticipantSummary; state: RowState }[] = [];
  for (const item of items) {
    const state = rowState(item);
    if (state) rows.push({ item, state });
  }
  return rows
    .sort((a, b) => ROW_ORDER[a.state] - ROW_ORDER[b.state])
    .slice(0, max);
}
