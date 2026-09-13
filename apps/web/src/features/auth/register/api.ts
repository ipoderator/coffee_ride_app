import {
  registerRequestSchema,
  type ProblemDetails,
  type RegisterRequest,
  type RegisterResponse,
} from 'types';

export { registerRequestSchema };
export type { RegisterRequest, RegisterResponse };

// Same-origin, relative path (ADR-013, `next.config.ts`'s rewrites()) — never
// an absolute API host from client code.
const REGISTER_ENDPOINT = '/api/v1/auth/register';

export class ApiError extends Error {
  constructor(public readonly problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ApiError';
  }
}

/**
 * Typed client for this feature only (`.claude/rules/extensibility.md`'s
 * feature-module structure) — posts to the shared auth contract
 * (`packages/types`) and maps a failed response to `ApiError` carrying the
 * full `ProblemDetails` envelope, so the form can branch on `problem.code`.
 */
export async function registerAccount(
  payload: RegisterRequest,
): Promise<RegisterResponse> {
  const response = await fetch(REGISTER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const body = (await response.json()) as RegisterResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as RegisterResponse;
}
