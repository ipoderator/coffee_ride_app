import type {
  ListRideParticipantsResponse,
  ListRideWaitlistResponse,
  ProblemDetails,
  RideStatus,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { RideParticipantSummary } from 'types';

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * CR-037 ("Organizer participant list"): this feature module doesn't have its own
 * `GET .../status` endpoint — `status` is read off `GET /v1/rides/:id`'s response,
 * same "no separate endpoint" precedent `features/organizer/route/api.ts`'s
 * `getRideRouteState` already uses.
 */
export async function getRideStatus(rideId: string): Promise<RideStatus> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}`);
  const body = (await response.json()) as
    { ride: { status: RideStatus } } | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as { ride: { status: RideStatus } }).ride.status;
}

/**
 * `404 ride_not_found` for a non-existent ride or one that isn't the caller's.
 * No "load more" UI consumes `nextCursor` yet — same precedent `RidesList`/
 * `DiscoveryView` already set (`.claude/context/current-task.md`'s scope decision).
 */
export async function getRideParticipants(
  rideId: string,
): Promise<ListRideParticipantsResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/participants`);
  const body = (await response.json()) as
    ListRideParticipantsResponse | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return body as ListRideParticipantsResponse;
}

/** Same shape/errors as {@link getRideParticipants}, filtered to `waiting` entries. */
export async function getRideWaitlist(
  rideId: string,
): Promise<ListRideWaitlistResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/waitlist`);
  const body = (await response.json()) as
    ListRideWaitlistResponse | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return body as ListRideWaitlistResponse;
}
