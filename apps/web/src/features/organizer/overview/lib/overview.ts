import type { Ride } from 'types';
import { countdownParts, ORGANIZER_OVERVIEW_TERMS } from 'ui';

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

/** «15/20», or just «15» for a ride without a participant limit. */
export function registeredValue(count: number, limit: number | null): string {
  return limit === null ? String(count) : `${count}/${limit}`;
}
