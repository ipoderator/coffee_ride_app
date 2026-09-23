import type {
  GetRideResponse,
  ListRideParticipantsResponse,
  ListRideWaitlistResponse,
  ProblemDetails,
  RideGroupSummary,
  RideStatus,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type {
  RideGroupRef,
  RideGroupSummary,
  RideParticipantSummary,
} from 'types';

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

/**
 * CR-120: the ride's pace groups in `position` order, read off the same
 * `GET /v1/rides/:id` as {@link getRideStatus} (`groups: []` without groups) —
 * needed so the participant list can show every group heading in the
 * organizer's order, including a group nobody has joined yet.
 */
export async function getRideGroups(
  rideId: string,
): Promise<RideGroupSummary[]> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}`);
  // `groups` sits next to `ride` in `GetRideResponse`, not inside it.
  const body = (await response.json()) as
    Pick<GetRideResponse, 'groups'> | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as Pick<GetRideResponse, 'groups'>).groups ?? [];
}
