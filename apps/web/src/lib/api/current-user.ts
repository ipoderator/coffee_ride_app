import type { MeResponse, ProblemDetails } from 'types';
import { ApiError } from './errors';

// Same-origin, relative path (ADR-013) — shared by the cabinet shell (to
// resolve who's logged in / redirect to `/login`) and the profile feature (to
// load the form's initial values), so it lives here rather than inside either
// one (`.claude/rules/extensibility.md`: a cross-cutting utility, not a
// feature-to-feature import).
const ME_ENDPOINT = '/api/v1/auth/me';

export async function getCurrentUser(): Promise<MeResponse> {
  const response = await fetch(ME_ENDPOINT, {
    // The cabinet shell always wants the live session state, never a cached
    // 401-turned-200 (or vice versa) from the browser's HTTP cache.
    cache: 'no-store',
  });

  const body = (await response.json()) as MeResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as MeResponse;
}
