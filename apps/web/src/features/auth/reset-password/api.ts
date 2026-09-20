import {
  resetPasswordRequestSchema,
  type ProblemDetails,
  type ResetPasswordRequest,
  type ResetPasswordResponse,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { resetPasswordRequestSchema, ApiError };
export type { ResetPasswordRequest, ResetPasswordResponse };

// Same-origin, relative path (ADR-013).
const RESET_PASSWORD_ENDPOINT = '/api/v1/auth/reset-password';

/**
 * Typed client for this feature only (`.claude/rules/extensibility.md`,
 * CR-099, closes KI-042's screen gap).
 */
export async function resetPassword(
  payload: ResetPasswordRequest,
): Promise<ResetPasswordResponse> {
  const response = await fetch(RESET_PASSWORD_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as
    ResetPasswordResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as ResetPasswordResponse;
}
