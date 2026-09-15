import type { GetRideResponse, ProblemDetails } from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { GetRideResponse };

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * CR-023 ("Ride detail"): unlike every other typed client in this codebase, this
 * request is not guaranteed to carry a session cookie at all — a participant may be
 * unauthenticated. The endpoint itself (`GET /v1/rides/:id`) already handles that
 * (`apps/api/src/modules/rides/rides.service.ts`'s `getRideForViewer`); this client is
 * unchanged from the organizer feature's `getRide` in shape, just returning the wider
 * `GetRideResponse` (adds `organizer`). 404s `ride_not_found` for a non-existent id, a
 * `draft` ride, or a `draft` ride belonging to someone else — `RideDetailView` shows
 * the same not-found state for all three, never revealing which.
 */
export async function getRideDetail(id: string): Promise<GetRideResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${id}`);

  const body = (await response.json()) as GetRideResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as GetRideResponse;
}
