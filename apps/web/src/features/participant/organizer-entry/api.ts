import type { GetOrganizerProfileResponse, ProblemDetails } from 'types';
import { ApiError } from '@/lib/api/errors';

/**
 * CR-185: whether the signed-in user already organizes rides — their own
 * organizer profile (`GET /v1/organizers/me`), or `null` on `404` (none
 * yet). Any other failure throws, so the card never guesses a next step.
 * Its own copy, not an import from an organizer feature module (ADR-009).
 */
export async function getOwnOrganizerProfileOrNull(): Promise<GetOrganizerProfileResponse | null> {
  const response = await fetch('/api/v1/organizers/me', { cache: 'no-store' });
  if (response.status === 404) return null;
  const body = (await response.json()) as
    GetOrganizerProfileResponse | ProblemDetails;
  if (!response.ok) throw new ApiError(body as ProblemDetails);
  return body as GetOrganizerProfileResponse;
}
