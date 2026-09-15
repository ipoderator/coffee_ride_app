import type { ListPublicRidesResponse, ProblemDetails } from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { ListPublicRidesResponse };

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * CR-024 ("Ride list", public discovery): `GET /v1/rides`, no session cookie ever
 * required or sent (`docs/api.md`: "no auth"). Always fetches one page — same
 * "no load more yet" precedent `features/organizer/rides/api.ts`'s `listMyRides`
 * already established for `/mine` (the underlying API is already cursor-paginated
 * per ADR-011 for when a `Pagination` component exists).
 */
export async function listPublicRides(
  params: { limit?: number; cursor?: string } = {},
): Promise<ListPublicRidesResponse> {
  const query = new URLSearchParams();
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor !== undefined) query.set('cursor', params.cursor);
  const queryString = query.toString();

  const response = await fetch(
    `${RIDES_ENDPOINT}${queryString ? `?${queryString}` : ''}`,
  );

  const body = (await response.json()) as
    ListPublicRidesResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as ListPublicRidesResponse;
}
