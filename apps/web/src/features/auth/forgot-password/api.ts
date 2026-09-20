import {
  forgotPasswordRequestSchema,
  type ForgotPasswordRequest,
  type ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { forgotPasswordRequestSchema, ApiError };
export type { ForgotPasswordRequest };

// Same-origin, relative path (ADR-013).
const FORGOT_PASSWORD_ENDPOINT = '/api/v1/auth/forgot-password';

/**
 * Typed client for this feature only (`.claude/rules/extensibility.md`,
 * CR-099, closes KI-042's screen gap). `POST /v1/auth/forgot-password`
 * always returns `204 No Content` (`.claude/rules/security.md`: identical
 * response whether or not the email belongs to a real account) — this
 * resolves with no value on success, and only ever throws on a genuine
 * transport/validation failure, never on "no such account".
 */
export async function requestPasswordReset(
  payload: ForgotPasswordRequest,
): Promise<void> {
  const response = await fetch(FORGOT_PASSWORD_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}
