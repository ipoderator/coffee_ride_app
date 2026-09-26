import type { Ride, RideParticipantSummary } from 'types';
import { countdownParts, ORGANIZER_OVERVIEW_TERMS } from 'ui';

const DAY_MS = 86_400_000;

/**
 * The «Ближайший» cell's value: «Идёт» for a ride under way, else whole days
 * to the start («2 дн»), hours inside the last day («5 ч»), «< 1 ч» inside
 * the last hour.
 */
export function nearestRideValue(ride: Ride, now: Date): string {
  if (ride.status === 'started') return ORGANIZER_OVERVIEW_TERMS.nearestStarted;
  const { days, hours } = countdownParts(new Date(ride.startsAt), now);
  if (days > 0) return ORGANIZER_OVERVIEW_TERMS.nearestInDays(days);
  if (hours > 0) return ORGANIZER_OVERVIEW_TERMS.nearestInHours(hours);
  return ORGANIZER_OVERVIEW_TERMS.nearestUnderHour;
}

/** Registrations made in the 24 hours before `now` («+3 за сутки»). */
export function registrationsInLastDay(
  participants: RideParticipantSummary[],
  now: Date,
): number {
  const since = now.getTime() - DAY_MS;
  return participants.filter(
    (participant) => new Date(participant.createdAt).getTime() > since,
  ).length;
}

/** «15/20», or just «15» for a ride without a participant limit. */
export function registeredValue(count: number, limit: number | null): string {
  return limit === null ? String(count) : `${count}/${limit}`;
}
