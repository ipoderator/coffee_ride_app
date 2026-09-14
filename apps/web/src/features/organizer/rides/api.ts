import {
  createRideRequestSchema,
  updateRideRequestSchema,
  type CreateRideRequest,
  type CreateRideResponse,
  type ListRidesResponse,
  type ProblemDetails,
  type Ride,
  type UpdateRideRequest,
  type UpdateRideResponse,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { createRideRequestSchema, updateRideRequestSchema, ApiError };
export type {
  CreateRideRequest,
  CreateRideResponse,
  ListRidesResponse,
  UpdateRideRequest,
  UpdateRideResponse,
};

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * Typed client for this feature only (`.claude/rules/extensibility.md`). Throws
 * `ApiError` on any non-2xx response, including the expected
 * `organizer_profile_required` 403 — `CreateRideForm` catches that one specifically
 * to show a guiding message instead of a generic error.
 */
export async function createRide(
  payload: CreateRideRequest,
): Promise<CreateRideResponse> {
  const response = await fetch(RIDES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as CreateRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as CreateRideResponse;
}

/**
 * CR-088 ("Organizer rides list"): the caller's own rides, any status. Always fetches
 * one page — `RidesList` doesn't offer "load more" yet (no product requirement for it
 * this ticket; the underlying API is already cursor-paginated per ADR-011 for when it
 * does).
 */
export async function listMyRides(
  params: { limit?: number; cursor?: string } = {},
): Promise<ListRidesResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor !== undefined) query.set('cursor', params.cursor);
  const queryString = query.toString();

  const response = await fetch(
    `${RIDES_ENDPOINT}/mine${queryString ? `?${queryString}` : ''}`,
  );

  const body = (await response.json()) as ListRidesResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as ListRidesResponse;
}

/** CR-016/CR-018: 404s `ride_not_found` both for a non-existent id and one owned by a
 * different organizer — `EditRideForm` shows the same not-found state either way. */
export async function getRide(id: string): Promise<{ ride: Ride }> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}`);

  const body = (await response.json()) as { ride: Ride } | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as { ride: Ride };
}

export async function updateRide(
  id: string,
  payload: UpdateRideRequest,
): Promise<UpdateRideResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as UpdateRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as UpdateRideResponse;
}
