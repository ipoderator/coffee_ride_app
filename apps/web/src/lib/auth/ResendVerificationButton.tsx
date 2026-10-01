'use client';

import { useState } from 'react';
import { Button, RESEND_VERIFICATION_TERMS } from 'ui';
import { ApiError } from '@/lib/api/errors';
import { resendVerificationEmail } from '@/lib/api/current-user';
import { useOptionalSession } from './session-context';

/**
 * CR-168 (KI-026): the one way out of an unverified-email dead end. Before
 * this, `POST /v1/auth/register` issued the only verification token a user
 * would ever get — once it expired (24h) or the email never arrived, the
 * account was permanently unverifiable through the product, since `/register`
 * answers 409 for the taken email and no resend endpoint existed. The only
 * recovery was a direct `POST`/DB write.
 *
 * Shared by three unrelated surfaces (`/verify-email`'s error states, and the
 * `email_verification_required` banners on `/organizer/profile` and ride-edit's
 * publish action), so it lives in `lib/auth` as a cross-cutting concern rather
 * than inside one feature module (`.claude/rules/extensibility.md`). Not in
 * `packages/ui`: that package is presentational and never fetches
 * (`.claude/rules/frontend.md`).
 *
 * The endpoint is session-authenticated, so an anonymous viewer gets the
 * `signedOutHint` instead of a button that could only ever 401 — a stale link
 * opened in a browser with no session is a real case, and «войдите» is more
 * useful there than a dead control.
 */
export function ResendVerificationButton({
  className,
}: {
  className?: string;
}) {
  const session = useOptionalSession();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    'sent' | 'rate-limited' | 'failed' | null
  >(null);

  // `loading` renders nothing rather than a flash of the signed-out hint: the
  // session resolves on mount, and guessing wrong for a moment would show a
  // signed-in organizer «войдите в аккаунт». No provider at all (`null`) is
  // treated the same way — this button is supplementary to whatever renders it,
  // so it stays silent rather than taking the surrounding form down.
  if (session === null || session.status === 'loading') return null;

  if (session.status !== 'authenticated') {
    return (
      <p className={className ? `text-body-sm ${className}` : 'text-body-sm'}>
        {RESEND_VERIFICATION_TERMS.signedOutHint}
      </p>
    );
  }

  async function handleResend() {
    if (pending) return;
    setPending(true);
    setResult(null);

    try {
      await resendVerificationEmail();
      setResult('sent');
    } catch (error) {
      // 429 gets its own copy: "wait a minute" is actionable, where the
      // generic "try again later" invites an immediate retry that can't work.
      setResult(
        error instanceof ApiError && error.problem.status === 429
          ? 'rate-limited'
          : 'failed',
      );
    } finally {
      setPending(false);
    }
  }

  // Success is terminal for this control: the link is in the user's inbox, and
  // leaving the button live would only burn the per-account rate limit (and
  // invalidate the link they were just told to use).
  if (result === 'sent') {
    return (
      <p
        role="status"
        aria-live="polite"
        className={
          className
            ? `text-body-sm text-success ${className}`
            : 'text-body-sm text-success'
        }
      >
        {RESEND_VERIFICATION_TERMS.success}
      </p>
    );
  }

  return (
    <div className={className}>
      <Button
        variant="secondary"
        onClick={handleResend}
        isLoading={pending}
        className="self-start"
      >
        {pending
          ? RESEND_VERIFICATION_TERMS.submitPending
          : RESEND_VERIFICATION_TERMS.submit}
      </Button>

      {result !== null && (
        <p role="alert" className="mt-2 text-body-sm text-danger">
          {result === 'rate-limited'
            ? RESEND_VERIFICATION_TERMS.rateLimited
            : RESEND_VERIFICATION_TERMS.genericError}
        </p>
      )}
    </div>
  );
}
