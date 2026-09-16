import type {
  CreateRideUpdateResponse,
  ListRideUpdatesResponse,
  ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { RideUpdate } from 'types';

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * CR-039 ("Ride updates"): an organizer's own ride's update history, newest
 * first. `404 ride_not_found` for a non-existent ride or one that isn't the
 * caller's. No "load more" UI — same precedent every other list screen in this
 * repo already established.
 */
export async function getRideUpdates(
  rideId: string,
): Promise<ListRideUpdatesResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/updates`);
  const body = (await response.json()) as
    ListRideUpdatesResponse | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return body as ListRideUpdatesResponse;
}

/**
 * CR-039: sends a new update, fanning out a notification to every currently-
 * active registrant server-side. `404 ride_not_found` for a non-existent ride or
 * one that isn't the caller's; `400 validation_error` for an empty/too-long
 * message.
 */
export async function createRideUpdate(
  rideId: string,
  message: string,
): Promise<CreateRideUpdateResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/updates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const body = (await response.json()) as
    CreateRideUpdateResponse | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return body as CreateRideUpdateResponse;
}
