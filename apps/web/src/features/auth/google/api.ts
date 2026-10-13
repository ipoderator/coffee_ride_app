import { GOOGLE_SIGN_IN_OUTCOMES, safeNextPath } from 'types';
import type { GoogleSignInOutcome } from 'types';

// CR-247 (ADR-034). Same-origin paths (ADR-013): apps/web proxies `/api/v1/*`.
const GOOGLE_START = '/api/v1/auth/google';

/**
 * The start of the sign-in: a full-page navigation (not `fetch`) — the API answers
 * with a redirect to Google and sets the sign-in cookie. Carries `next` only when it
 * is a safe return target; the API checks it again.
 */
export function googleSignInHref(next?: string | null): string {
  const safe = safeNextPath(next);
  return safe
    ? `${GOOGLE_START}?next=${encodeURIComponent(safe)}`
    : GOOGLE_START;
}

/** `?oauth=` from `/login`, when it names a known outcome. */
export function parseGoogleOutcome(raw: unknown): GoogleSignInOutcome | null {
  return (GOOGLE_SIGN_IN_OUTCOMES as readonly unknown[]).includes(raw)
    ? (raw as GoogleSignInOutcome)
    : null;
}
