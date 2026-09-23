import type {
  CreateRideGroupRequest,
  CreateRideGroupResponse,
  ListRideGroupsResponse,
  ProblemDetails,
  RideGroup,
  RideStatus,
  UpdateRideGroupRequest,
  UpdateRideGroupResponse,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { RideGroup, RideGroupWithCount } from 'types';

const RIDES_ENDPOINT = '/api/v1/rides';

async function readProblem(response: Response): Promise<ProblemDetails> {
  return (await response.json()) as ProblemDetails;
}

/**
 * CR-120: the groups editor needs the ride's status up front so a
 * `finished`/`cancelled` ride renders read-only instead of offering buttons the
 * server would refuse (`409 ride_groups_not_editable`). Same "read it off
 * `GET /v1/rides/:id`" precedent as `features/organizer/participants/api.ts`'s
 * `getRideStatus` — duplicated rather than imported, since a feature module never
 * reaches into another's internals (ADR-009).
 */
export async function getRideStatus(rideId: string): Promise<RideStatus> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}`);
  if (!response.ok) throw new ApiError(await readProblem(response));
  const body = (await response.json()) as { ride: { status: RideStatus } };
  return body.ride.status;
}

/** `GET /v1/rides/:id/groups` — organizer-only, `position` order, with counts.
 * A ride has at most 6 groups, so the first page is always the whole list. */
export async function listRideGroups(
  rideId: string,
): Promise<ListRideGroupsResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/groups`);
  if (!response.ok) throw new ApiError(await readProblem(response));
  return (await response.json()) as ListRideGroupsResponse;
}

/** `409 group_limit_reached` / `group_name_taken` / `ride_groups_not_editable`. */
export async function createRideGroup(
  rideId: string,
  input: CreateRideGroupRequest,
): Promise<RideGroup> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new ApiError(await readProblem(response));
  return ((await response.json()) as CreateRideGroupResponse).group;
}

/** Any subset of fields; `position` alone is how a group is reordered. */
export async function updateRideGroup(
  rideId: string,
  groupId: string,
  patch: UpdateRideGroupRequest,
): Promise<RideGroup> {
  const response = await fetch(
    `${RIDES_ENDPOINT}/${rideId}/groups/${groupId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  if (!response.ok) throw new ApiError(await readProblem(response));
  return ((await response.json()) as UpdateRideGroupResponse).group;
}

/** `204`; `409 group_has_registrations` while anyone is still in the group. */
export async function deleteRideGroup(
  rideId: string,
  groupId: string,
): Promise<void> {
  const response = await fetch(
    `${RIDES_ENDPOINT}/${rideId}/groups/${groupId}`,
    { method: 'DELETE' },
  );
  if (!response.ok) throw new ApiError(await readProblem(response));
}
