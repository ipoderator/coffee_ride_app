import type {
  GetOrganizerRegistrationActivityResponse,
  OrganizerActivityQuery,
  ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

/**
 * KI-066: «Новые записи» and «Записи по дням» across every ride the caller
 * organizes, in one request (`GET /v1/rides/mine/registrations/activity`).
 */
export async function getRegistrationActivity(
  query: OrganizerActivityQuery,
): Promise<GetOrganizerRegistrationActivityResponse> {
  const params = new URLSearchParams(query);
  const response = await fetch(
    `/api/v1/rides/mine/registrations/activity?${params.toString()}`,
    { cache: 'no-store' },
  );
  const body = (await response.json()) as
    GetOrganizerRegistrationActivityResponse | ProblemDetails;
  if (!response.ok) throw new ApiError(body as ProblemDetails);
  return body as GetOrganizerRegistrationActivityResponse;
}
