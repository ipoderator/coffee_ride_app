import type {
  GetOrganizerProfileResponse,
  GetOrganizerRideSummaryResponse,
  ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const body = (await response.json()) as T | ProblemDetails;
  if (!response.ok) throw new ApiError(body as ProblemDetails);
  return body as T;
}

/**
 * CR-131: the caller's own organizer profile with its rating aggregate
 * (`GET /v1/organizers/me`, CR-043). `404` = no profile yet. Its own copy,
 * not an import from `features/organizer/profile` (ADR-009).
 */
export function getOwnOrganizerProfile(): Promise<GetOrganizerProfileResponse> {
  return getJson<GetOrganizerProfileResponse>('/api/v1/organizers/me');
}

/** CR-103's cross-ride counts (`GET /v1/rides/mine/summary`). */
export function getOwnRideSummary(): Promise<GetOrganizerRideSummaryResponse> {
  return getJson<GetOrganizerRideSummaryResponse>('/api/v1/rides/mine/summary');
}
