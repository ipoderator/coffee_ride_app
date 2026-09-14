import {
  createOrganizerProfileRequestSchema,
  updateOrganizerProfileRequestSchema,
  type CreateOrganizerProfileRequest,
  type CreateOrganizerProfileResponse,
  type GetOrganizerProfileResponse,
  type ProblemDetails,
  type UpdateOrganizerProfileRequest,
  type UpdateOrganizerProfileResponse,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export {
  createOrganizerProfileRequestSchema,
  updateOrganizerProfileRequestSchema,
  ApiError,
};
export type {
  CreateOrganizerProfileRequest,
  CreateOrganizerProfileResponse,
  GetOrganizerProfileResponse,
  UpdateOrganizerProfileRequest,
  UpdateOrganizerProfileResponse,
};

const ORGANIZERS_ME_ENDPOINT = '/api/v1/organizers/me';

/**
 * Typed client for this feature only (`.claude/rules/extensibility.md`). Throws
 * `ApiError` on any non-2xx response, including the expected
 * `organizer_profile_not_found` 404 — `OrganizerProfileForm` catches that one
 * specifically to distinguish "no profile yet" from a real load failure.
 */
export async function getOrganizerProfile(): Promise<GetOrganizerProfileResponse> {
  const response = await fetch(ORGANIZERS_ME_ENDPOINT, { cache: 'no-store' });

  const body = (await response.json()) as
    GetOrganizerProfileResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as GetOrganizerProfileResponse;
}

export async function createOrganizerProfile(
  payload: CreateOrganizerProfileRequest,
): Promise<CreateOrganizerProfileResponse> {
  const response = await fetch(ORGANIZERS_ME_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as
    CreateOrganizerProfileResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as CreateOrganizerProfileResponse;
}

export async function updateOrganizerProfile(
  payload: UpdateOrganizerProfileRequest,
): Promise<UpdateOrganizerProfileResponse> {
  const response = await fetch(ORGANIZERS_ME_ENDPOINT, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as
    UpdateOrganizerProfileResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as UpdateOrganizerProfileResponse;
}
