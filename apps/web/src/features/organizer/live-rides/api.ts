import type {
  ListRidesResponse,
  Paginated,
  ProblemDetails,
  RegistrationAttendance,
  RideParticipantSummary,
  SetAttendanceResponse,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };

const RIDES_ENDPOINT = '/api/v1/rides';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = (await response.json()) as T | ProblemDetails;
  if (!response.ok) throw new ApiError(body as ProblemDetails);
  return body as T;
}

/** The caller's own rides (`GET /v1/rides/mine`), one page at the server cap. */
export async function listOwnRides(): Promise<ListRidesResponse['items']> {
  const page = await request<ListRidesResponse>(
    `${RIDES_ENDPOINT}/mine?limit=100`,
  );
  return page.items;
}

/** A ride's active registrations (`GET /v1/rides/:id/participants`), first page. */
export async function listRideParticipants(
  rideId: string,
): Promise<RideParticipantSummary[]> {
  const page = await request<Paginated<RideParticipantSummary>>(
    `${RIDES_ENDPOINT}/${rideId}/participants?limit=100`,
  );
  return page.items;
}

/** CR-181: confirm one participant's claimed finish (`PUT .../attendance`). */
export function confirmFinish(
  rideId: string,
  registrationId: string,
  attendance: RegistrationAttendance = 'finished',
): Promise<SetAttendanceResponse> {
  return request<SetAttendanceResponse>(
    `${RIDES_ENDPOINT}/${rideId}/attendance`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ registrationIds: [registrationId], attendance }),
    },
  );
}
