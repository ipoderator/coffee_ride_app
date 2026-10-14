import {
  GOOGLE_SIGN_IN_OUTCOMES,
  OAUTH_OUTCOME_PROVIDER_PARAM,
  safeNextPath,
  YANDEX_SIGN_IN_OUTCOMES,
} from 'types';
import type { GoogleSignInOutcome, YandexSignInOutcome } from 'types';

// CR-247 (ADR-034), CR-260 (ADR-037): «Войти через Google» / «Войти через Яндекс».
// Same-origin paths (ADR-013): apps/web proxies `/api/v1/*`.

export type SignInProvider = 'google' | 'yandex';

/** Why a provider's sign-in came back to `/login` without a session. */
export type OAuthOutcome =
  | { provider: 'google'; outcome: GoogleSignInOutcome }
  | { provider: 'yandex'; outcome: YandexSignInOutcome };

/**
 * The start of the sign-in: a full-page navigation (not `fetch`) — the API answers
 * with a redirect to the provider and sets the sign-in cookie. Carries `next` only
 * when it is a safe return target; the API checks it again.
 */
export function oauthSignInHref(
  provider: SignInProvider,
  next?: string | null,
): string {
  const start = `/api/v1/auth/${provider}`;
  const safe = safeNextPath(next);
  return safe ? `${start}?next=${encodeURIComponent(safe)}` : start;
}

function known<T extends string>(list: readonly T[], raw: unknown): raw is T {
  return (list as readonly unknown[]).includes(raw);
}

/**
 * `?oauth=` (+ `?provider=`) from `/login`, when it names a known outcome. No
 * `provider` means Google: CR-247's redirects never carried one.
 */
export function parseOAuthOutcome(params: {
  oauth?: unknown;
  [OAUTH_OUTCOME_PROVIDER_PARAM]?: unknown;
}): OAuthOutcome | null {
  const { oauth } = params;
  const provider = params[OAUTH_OUTCOME_PROVIDER_PARAM];
  if (provider === 'yandex') {
    return known(YANDEX_SIGN_IN_OUTCOMES, oauth)
      ? { provider, outcome: oauth }
      : null;
  }
  if (provider === undefined || provider === 'google') {
    return known(GOOGLE_SIGN_IN_OUTCOMES, oauth)
      ? { provider: 'google', outcome: oauth }
      : null;
  }
  return null;
}
