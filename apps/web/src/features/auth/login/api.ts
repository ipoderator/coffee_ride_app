import {
  loginRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { loginRequestSchema, ApiError };
export type { LoginRequest, LoginResponse };

// Same-origin, relative path (ADR-013).
const LOGIN_ENDPOINT = '/api/v1/auth/login';

/**
 * Typed client for this feature only (`.claude/rules/extensibility.md`).
 * Login itself sets the session cookie via `Set-Cookie` — the browser handles
 * that automatically for a same-origin `fetch`, nothing here reads/stores it.
 */
export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const response = await fetch(LOGIN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as LoginResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as LoginResponse;
}
