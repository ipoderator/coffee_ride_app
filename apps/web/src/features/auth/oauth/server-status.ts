import type {
  GoogleSignInStatusResponse,
  YandexSignInStatusResponse,
} from 'types';
import { API_INTERNAL_URL } from '@/lib/site/site-url';
import type { SignInProvider } from './api';

// CR-247 (ADR-034), CR-260 (ADR-037): `/login` and `/register` ask `apps/api` server
// to server which providers are configured, so the buttons arrive in the first HTML —
// a client fetch after hydration showed them seconds late and shifted the page. Same
// server-only origin as `lookupRide` (`lib/rides/server-ride.ts`).

// The status is a constant read, ~ms on the internal network; never hold the page
// for it.
const STATUS_TIMEOUT_MS = 1_500;

/**
 * Whether the server has this provider's OAuth client configured. Fails soft to
 * `false`: a missing button is the degraded state, not an error.
 */
export async function isSignInProviderAvailable(
  provider: SignInProvider,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_INTERNAL_URL}/v1/auth/${provider}/status`,
      {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
      },
    );
    if (!response.ok) return false;
    const body = (await response.json()) as
      GoogleSignInStatusResponse | YandexSignInStatusResponse;
    return body.available === true;
  } catch {
    return false;
  }
}

/** Both providers' availability, asked in parallel. */
export async function signInProviders(): Promise<
  Record<SignInProvider, boolean>
> {
  const [google, yandex] = await Promise.all([
    isSignInProviderAvailable('google'),
    isSignInProviderAvailable('yandex'),
  ]);
  return { google, yandex };
}
