import type { ListMyRegistrationsResponse, ProblemDetails } from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { ListMyRegistrationsResponse };

const REGISTRATIONS_ENDPOINT = '/api/v1/registrations';

/**
 * CR-091 ("My registrations"), `.claude/context/current-task.md`. `GET
 * /v1/registrations/mine` — requires a session cookie (sent automatically, same
 * origin, ADR-013), `when` is required (`'upcoming' | 'past'`, no "all" default).
 * Always fetches one page — same "no load more yet" precedent
 * `features/organizer/rides/api.ts`'s `listMyRides` already established.
 */
export async function listMyRegistrations(params: {
  when: 'upcoming' | 'past';
  limit?: number;
  cursor?: string;
}): Promise<ListMyRegistrationsResponse> {
  const query = new URLSearchParams({ when: params.when });
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.cursor !== undefined) query.set('cursor', params.cursor);

  const response = await fetch(
    `${REGISTRATIONS_ENDPOINT}/mine?${query.toString()}`,
  );

  const body = (await response.json()) as
    ListMyRegistrationsResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as ListMyRegistrationsResponse;
}
