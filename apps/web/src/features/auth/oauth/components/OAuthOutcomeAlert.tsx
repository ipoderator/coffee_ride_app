import { GOOGLE_SIGN_IN_TERMS, YANDEX_SIGN_IN_TERMS } from 'ui';
import type { OAuthOutcome } from '../api';

/**
 * CR-247, CR-260: why a Google or Yandex sign-in came back to `/login` without a
 * session (`?oauth=<outcome>[&provider=yandex]`, already validated by the page).
 */
export function OAuthOutcomeAlert({ result }: { result: OAuthOutcome | null }) {
  if (!result) return null;
  const text =
    result.provider === 'yandex'
      ? YANDEX_SIGN_IN_TERMS.outcome[result.outcome]
      : GOOGLE_SIGN_IN_TERMS.outcome[result.outcome];
  return (
    <p
      role="alert"
      className={
        result.outcome === 'cancelled'
          ? 'text-body-sm text-text-secondary'
          : 'text-body-sm text-danger'
      }
    >
      {text}
    </p>
  );
}
