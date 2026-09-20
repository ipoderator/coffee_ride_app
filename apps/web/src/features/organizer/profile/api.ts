import {
  createOrganizerProfileRequestSchema,
  updateOrganizerProfileRequestSchema,
  type AvatarResponse,
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
const AVATAR_ENDPOINT = '/api/v1/organizers/me/avatar';

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

// CR-097 (KI-023 remainder): same "me"-scoped mutation shape as
// `features/participant/profile/api.ts`'s avatar functions — the current
// avatar state comes from `getOrganizerProfile()`'s `organizerProfile.
// avatarUrl`, not a separate fetch.
async function uploadOrReplace(
  method: 'POST' | 'PATCH',
  file: File,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(AVATAR_ENDPOINT, { method, body: formData });
  const body = (await response.json()) as AvatarResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as AvatarResponse).avatarUrl;
}

/** 409 `avatar_already_exists` if one exists — use {@link replaceOrganizerAvatar}. */
export function uploadOrganizerAvatar(file: File): Promise<string> {
  return uploadOrReplace('POST', file);
}

/** 404 `avatar_not_found` if none exists yet — use {@link uploadOrganizerAvatar}. */
export function replaceOrganizerAvatar(file: File): Promise<string> {
  return uploadOrReplace('PATCH', file);
}

export async function deleteOrganizerAvatar(): Promise<void> {
  const response = await fetch(AVATAR_ENDPOINT, { method: 'DELETE' });
  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}
