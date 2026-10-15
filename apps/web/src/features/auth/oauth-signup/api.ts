import type {
  LegalConsents,
  OAuthSignupCompleteResponse,
  OAuthSignupInfo,
  ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };

// CR-269 (ADR-041): the consent step of a first Google/Yandex sign-in. The pending
// sign-up lives on the server behind an httpOnly cookie; these calls only send it.
const SIGNUP_ENDPOINT = '/api/v1/auth/oauth-signup';

async function problemOf(response: Response): Promise<ApiError> {
  return new ApiError((await response.json()) as ProblemDetails);
}

/** The provider and address being signed up; `410 oauth_signup_expired` without one. */
export async function getOAuthSignup(): Promise<OAuthSignupInfo> {
  const response = await fetch(SIGNUP_ENDPOINT, { cache: 'no-store' });
  if (!response.ok) throw await problemOf(response);
  return (await response.json()) as OAuthSignupInfo;
}

/** Accepts both documents; the account and the session exist after this. */
export async function completeOAuthSignup(
  consents: LegalConsents,
): Promise<OAuthSignupCompleteResponse> {
  const response = await fetch(SIGNUP_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consents }),
  });
  if (!response.ok) throw await problemOf(response);
  return (await response.json()) as OAuthSignupCompleteResponse;
}

/** «Отмена»: the server forgets the pending sign-up. */
export async function cancelOAuthSignup(): Promise<void> {
  const response = await fetch(SIGNUP_ENDPOINT, { method: 'DELETE' });
  if (!response.ok) throw await problemOf(response);
}
