import type { MeResponse, ProblemDetails } from 'types';
import { ApiError } from './errors';

// Same-origin, relative path (ADR-013) — shared by the cabinet shell (to
// resolve who's logged in / redirect to `/login`) and the profile feature (to
// load the form's initial values), so it lives here rather than inside either
// one (`.claude/rules/extensibility.md`: a cross-cutting utility, not a
// feature-to-feature import).
const ME_ENDPOINT = '/api/v1/auth/me';
const LOGOUT_ENDPOINT = '/api/v1/auth/logout';
const RESEND_VERIFICATION_ENDPOINT = '/api/v1/auth/resend-verification';

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

/**
 * CR-108: signing out needs a client somewhere, and the header is the first
 * caller — cross-cutting like `getCurrentUser` above, not owned by any one
 * feature module. `POST /v1/auth/logout` replies `204` with no body, so unlike
 * every other client here there is nothing to parse on success; a failure body
 * is still `application/problem+json`.
 */
export async function logout(): Promise<void> {
  const response = await fetch(LOGOUT_ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError((await response.json()) as ProblemDetails);
  }
}

/**
 * CR-168 (KI-026): requests a replacement email-verification link for the
 * signed-in user. Cross-cutting for the same reason as `logout` above — three
 * unrelated surfaces call it (`/verify-email`'s error states, and the
 * `email_verification_required` banners on `/organizer/profile` and ride-edit's
 * publish), so it belongs here rather than inside any one feature module
 * (`.claude/rules/extensibility.md`).
 *
 * Bodyless by design: the server takes the user from the session cookie, never
 * from a client-supplied email (`.claude/rules/security.md`). Replies `204`
 * with no body — including for an already-verified caller, where it issues
 * nothing.
 */
export async function resendVerificationEmail(): Promise<void> {
  const response = await fetch(RESEND_VERIFICATION_ENDPOINT, {
    method: 'POST',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new ApiError((await response.json()) as ProblemDetails);
  }
}
