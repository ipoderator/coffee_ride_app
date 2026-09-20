import {
  verifyEmailRequestSchema,
  type ProblemDetails,
  type VerifyEmailRequest,
  type VerifyEmailResponse,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { verifyEmailRequestSchema, ApiError };
export type { VerifyEmailRequest, VerifyEmailResponse };

// Same-origin, relative path (ADR-013).
const VERIFY_EMAIL_ENDPOINT = '/api/v1/auth/verify-email';

/**
 * Typed client for this feature only (`.claude/rules/extensibility.md`). The
 * API route is POST-only (`auth.routes.ts`) — this is the client call the
 * `/verify-email` page makes on mount with the token from its `?token=`
 * query param (CR-099, closes KI-026's screen gap).
 */
export async function verifyEmail(
  payload: VerifyEmailRequest,
): Promise<VerifyEmailResponse> {
  const response = await fetch(VERIFY_EMAIL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as VerifyEmailResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as VerifyEmailResponse;
}
