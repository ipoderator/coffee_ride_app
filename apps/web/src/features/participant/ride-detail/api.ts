import type {
  CreateRegistrationResponse,
  GetRideResponse,
  GetRouteGeometryResponse,
  ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type {
  CreateRegistrationResponse,
  GetRideResponse,
  GetRouteGeometryResponse,
};

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

/**
 * CR-028 ("Route rendering"), resolving KI-035: the full ordered `Route.geometry`
 * array behind `GetRideResponse.route`'s summary. Same unauthenticated-friendly
 * shape as {@link getRideDetail} — the endpoint itself enforces the same
 * viewer-visibility rule. `RideDetailView` only calls this once `ride.route` is
 * non-null, so `route_not_found` is not an expected outcome in normal use.
 */
export async function getRouteGeometry(
  rideId: string,
): Promise<GetRouteGeometryResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/route/geometry`);

  const body = (await response.json()) as
    GetRouteGeometryResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as GetRouteGeometryResponse;
}

/**
 * CR-032 ("Register"). Throws `ApiError` on any non-2xx response — `unauthorized`
 * (401, no session — `RegistrationButton` redirects to `/login`),
 * `ride_registration_not_open`/`registration_already_exists`/`ride_full` (409).
 */
export async function registerForRide(
  rideId: string,
): Promise<CreateRegistrationResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/register`, {
    method: 'POST',
  });

  const body = (await response.json()) as
    CreateRegistrationResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as CreateRegistrationResponse;
}

/**
 * CR-033 ("Cancel registration"). `204` no body on success. Throws `ApiError` on any
 * non-2xx response — `unauthorized` (401) or `registration_not_found` (404).
 */
export async function cancelRideRegistration(rideId: string): Promise<void> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/register`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}
