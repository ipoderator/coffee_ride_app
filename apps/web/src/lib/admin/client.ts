import type { ProblemDetails } from 'types';
import { ApiError } from '@/lib/api/errors';

// CR-231 (ADR-032): the one fetch wrapper every `features/admin/*` api.ts calls —
// same-origin `/api/v1/admin/*` (ADR-013), the session cookie travels on its own.
// Cross-cutting like `@/lib/api/current-user`, so no admin feature imports
// another's client.

const ADMIN_ENDPOINT = '/api/v1/admin';

export async function adminRequest<T>(
  path: string,
  { method = 'GET', body }: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${ADMIN_ENDPOINT}${path}`, {
    method,
    cache: 'no-store',
    ...(body !== undefined
      ? {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }
      : {}),
  });
  if (response.status === 204) return undefined as T;
  // An error from outside the API (a proxy's HTML 502, an empty 500) has no
  // problem+json body — it still has to surface as an ApiError carrying its
  // status, or callers that branch on `problem.status` see a SyntaxError.
  const text = await response.text();
  const parsed = text
    ? (safeJson(text) as T | ProblemDetails | undefined)
    : undefined;
  if (!response.ok) {
    throw new ApiError(
      isProblem(parsed) ? parsed : fallbackProblem(response, path),
    );
  }
  return parsed as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isProblem(value: unknown): value is ProblemDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ProblemDetails).code === 'string' &&
    typeof (value as ProblemDetails).status === 'number'
  );
}

function fallbackProblem(response: Response, path: string): ProblemDetails {
  return {
    type: 'about:blank',
    title: response.statusText,
    status: response.status,
    detail: response.statusText,
    instance: `${ADMIN_ENDPOINT}${path}`,
    code: 'unexpected_response',
  };
}

/** `?a=1&b=x` from the defined values only; `''` when there are none. */
export function toQueryString(
  params: Record<string, string | number | undefined>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
