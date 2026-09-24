import type { GetRiderProfileResponse, ProblemDetails } from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { GetRiderProfileResponse };

/**
 * CR-126: `GET /v1/rides/:rideId/riders/:registrationId/profile` — a
 * participant's card, reached only through a `registrationId` surfaced by
 * that same ride's `GET /v1/rides/:id/riders` (`RideRider.registrationId`,
 * `../ride-detail/api.ts`'s `getRideRiders`). Access is gated server-side
 * (`resolveRiderAccess`, `apps/api/src/modules/registrations/
 * registrations.service.ts`) — throws `ApiError` on any non-2xx response:
 * `unauthorized` (401, viewer not signed in — shouldn't normally happen from a
 * link inside the signed-in-only riders list, but handled the same as
 * elsewhere), `riders_hidden` (403, the organizer turned off the whole list
 * for this ride), `profile_private` (403, this rider's own `profileVisibility`
 * doesn't grant this viewer access), `rider_not_found` (404, stale/bad
 * registration id).
 */
export async function getRiderProfile(
  rideId: string,
  registrationId: string,
): Promise<GetRiderProfileResponse> {
  const response = await fetch(
    `/api/v1/rides/${rideId}/riders/${registrationId}/profile`,
    { cache: 'no-store' },
  );

  const body = (await response.json()) as
    GetRiderProfileResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as GetRiderProfileResponse;
}
