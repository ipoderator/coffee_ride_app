import {
  createRideRequestSchema,
  type CreateRideRequest,
  type CreateRideResponse,
  type ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { createRideRequestSchema, ApiError };
export type { CreateRideRequest, CreateRideResponse };

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
