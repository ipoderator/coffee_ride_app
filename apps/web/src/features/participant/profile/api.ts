import {
  createBikeRequestSchema,
  updateBikeRequestSchema,
  updateProfileRequestSchema,
  type AvatarResponse,
  type Bike,
  type BikeResponse,
  type CreateBikeRequest,
  type ListBikesResponse,
  type ProblemDetails,
  type UpdateBikeRequest,
  type UpdateProfileRequest,
  type UpdateProfileResponse,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export {
  createBikeRequestSchema,
  updateBikeRequestSchema,
  updateProfileRequestSchema,
  ApiError,
};
export type {
  Bike,
  BikeResponse,
  CreateBikeRequest,
  ListBikesResponse,
  UpdateBikeRequest,
  UpdateProfileRequest,
  UpdateProfileResponse,
};

const UPDATE_PROFILE_ENDPOINT = '/api/v1/users/me';
const AVATAR_ENDPOINT = '/api/v1/users/me/avatar';
const BIKES_ENDPOINT = '/api/v1/users/me/bikes';
const BIKES_PAGE_SIZE = 20;

/**
 * Typed client for this feature only (`.claude/rules/extensibility.md`).
 * `payload` is sent as-is — including explicit `null`s the caller wants to
 * clear a field with — so this must not run through `JSON.stringify` after
 * dropping `undefined` keys in a way that would turn an omitted field into an
 * explicit `null` (`JSON.stringify` already drops `undefined` object values
 * on its own, which is exactly the behavior the API's PATCH semantics need).
 */
export async function updateProfile(
  payload: UpdateProfileRequest,
): Promise<UpdateProfileResponse> {
  const response = await fetch(UPDATE_PROFILE_ENDPOINT, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as
    UpdateProfileResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as UpdateProfileResponse;
}

// CR-097 (KI-023 remainder): same 3-verb shape as `features/organizer/
// cover-image/api.ts` (create/replace/delete), minus a separate `GET` state
// call — the caller's own avatar state comes from `initialUser.avatarUrl`
// (`useCurrentUser()`), not a second fetch.
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

/** 409 `avatar_already_exists` if one exists — use {@link replaceAvatar}. */
export function uploadAvatar(file: File): Promise<string> {
  return uploadOrReplace('POST', file);
}

/** 404 `avatar_not_found` if none exists yet — use {@link uploadAvatar}. */
export function replaceAvatar(file: File): Promise<string> {
  return uploadOrReplace('PATCH', file);
}

export async function deleteAvatar(): Promise<void> {
  const response = await fetch(AVATAR_ENDPOINT, { method: 'DELETE' });
  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}

/**
 * CR-126 ("garage"): `GET /v1/users/me/bikes` — paginated per ADR-011, `cursor`
 * passed through opaque, same shape as `getRideRiders`.
 */
export async function listBikes(
  cursor?: string | null,
): Promise<ListBikesResponse> {
  const params = new URLSearchParams({ limit: String(BIKES_PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  const response = await fetch(`${BIKES_ENDPOINT}?${params.toString()}`, {
    cache: 'no-store',
  });

  const body = (await response.json()) as ListBikesResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as ListBikesResponse;
}

export async function createBike(
  payload: CreateBikeRequest,
): Promise<BikeResponse> {
  const response = await fetch(BIKES_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as BikeResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as BikeResponse;
}

export async function updateBike(
  bikeId: string,
  payload: UpdateBikeRequest,
): Promise<BikeResponse> {
  const response = await fetch(`${BIKES_ENDPOINT}/${bikeId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as BikeResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as BikeResponse;
}

export async function deleteBike(bikeId: string): Promise<void> {
  const response = await fetch(`${BIKES_ENDPOINT}/${bikeId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}
