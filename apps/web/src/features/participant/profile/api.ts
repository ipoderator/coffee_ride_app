import {
  updateProfileRequestSchema,
  type ProblemDetails,
  type UpdateProfileRequest,
  type UpdateProfileResponse,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { updateProfileRequestSchema, ApiError };
export type { UpdateProfileRequest, UpdateProfileResponse };

const UPDATE_PROFILE_ENDPOINT = '/api/v1/users/me';

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
