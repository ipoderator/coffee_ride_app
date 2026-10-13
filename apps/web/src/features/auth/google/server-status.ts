import type { GoogleSignInStatusResponse } from 'types';
import { API_INTERNAL_URL } from '@/lib/site/site-url';

// CR-247 (ADR-034): `/login` and `/register` ask `apps/api` server to server whether
// Google is configured, so the button arrives in the first HTML — a client fetch
// after hydration showed it seconds late and shifted the page. Same server-only
// origin as `lookupRide` (`lib/rides/server-ride.ts`).

// The status is a constant read, ~ms on the internal network; never hold the page
// for it.
const STATUS_TIMEOUT_MS = 1_500;

/**
 * Whether the server has a Google OAuth client configured. Fails soft to `false`:
 * a missing button is the degraded state, not an error.
 */
export async function isGoogleSignInAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${API_INTERNAL_URL}/v1/auth/google/status`, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as GoogleSignInStatusResponse;
    return body.available === true;
  } catch {
    return false;
  }
}
