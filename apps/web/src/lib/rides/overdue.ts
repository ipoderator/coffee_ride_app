import type { Ride } from 'types';

/** Published, not started yet: the statuses a past start time leaves stuck. */
const BEFORE_START: ReadonlySet<Ride['status']> = new Set([
  'published',
  'registration_open',
  'registration_closed',
]);

/**
 * CR-184: a ride whose start time has passed while it is still before
 * `started` — it needs the organizer's decision (start it or cancel it).
 * Never changed automatically; shared by the dashboard, the ride list and the
 * management view so the three never disagree.
 */
export function isRideOverdue(
  ride: Pick<Ride, 'status' | 'startsAt'>,
  now: Date,
): boolean {
  return (
    BEFORE_START.has(ride.status) &&
    new Date(ride.startsAt).getTime() <= now.getTime()
  );
}
