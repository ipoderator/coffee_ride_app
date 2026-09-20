import type { CoverImageResponse, ProblemDetails } from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * ADR-019/CR-086: this feature module doesn't have its own `GET .../cover`
 * JSON endpoint — `coverImageUrl` is an additive field on `GET /v1/rides/:id`'s
 * response (same "no separate read endpoint, embed it" precedent as
 * `route`/`stops`/`routePoints` — `apps/web/src/features/organizer/route/api.ts`).
 */
export async function getRideCoverState(rideId: string): Promise<{
  status: string;
  coverImageUrl: string | null;
}> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}`);
  const body = (await response.json()) as
    { ride: { status: string; coverImageUrl: string | null } } | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  const parsed = body as {
    ride: { status: string; coverImageUrl: string | null };
  };
  return {
    status: parsed.ride.status,
    coverImageUrl: parsed.ride.coverImageUrl,
  };
}

async function uploadOrReplace(
  method: 'POST' | 'PATCH',
  rideId: string,
  file: File,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/cover`, {
    method,
    body: formData,
  });

  const body = (await response.json()) as CoverImageResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as CoverImageResponse).coverImageUrl;
}

/** 409 `cover_image_already_exists` if one exists — use {@link replaceCoverImage}. */
export function uploadCoverImage(rideId: string, file: File): Promise<string> {
  return uploadOrReplace('POST', rideId, file);
}

/** 404 `cover_image_not_found` if none exists yet — use {@link uploadCoverImage}. */
export function replaceCoverImage(rideId: string, file: File): Promise<string> {
  return uploadOrReplace('PATCH', rideId, file);
}

export async function deleteCoverImage(rideId: string): Promise<void> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/cover`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}
