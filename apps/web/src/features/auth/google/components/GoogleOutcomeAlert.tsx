import type { GoogleSignInOutcome } from 'types';
import { GOOGLE_SIGN_IN_TERMS } from 'ui';

/**
 * CR-247: why the Google sign-in came back to `/login` without a session
 * (`?oauth=<outcome>`, already validated by the page).
 */
export function GoogleOutcomeAlert({
  outcome,
}: {
  outcome: GoogleSignInOutcome | null;
}) {
  if (!outcome) return null;
  return (
    <p
      role="alert"
      className={
        outcome === 'cancelled'
          ? 'text-body-sm text-text-secondary'
          : 'text-body-sm text-danger'
      }
    >
      {GOOGLE_SIGN_IN_TERMS.outcome[outcome]}
    </p>
  );
}
