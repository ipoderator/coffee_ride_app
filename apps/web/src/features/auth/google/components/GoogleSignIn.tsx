'use client';

import Link from 'next/link';
import { buttonClassName, GOOGLE_SIGN_IN_TERMS } from 'ui';
import { googleSignInHref } from '../api';
import { GoogleMark } from './GoogleMark';

/**
 * CR-247 (ADR-034): «Войти через Google» under the login/register form, keeping the
 * page's `next`. The page renders it only when `isGoogleSignInAvailable()` says the
 * server has `GOOGLE_*` (`../server-status.ts`). A plain link: the API redirects the
 * whole page to Google.
 */
export function GoogleSignIn({ next = null }: { next?: string | null }) {
  return (
    <div className="flex flex-col gap-4" data-testid="google-sign-in">
      <div
        className="flex items-center gap-3 text-body-sm text-text-secondary"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-border" />
        {GOOGLE_SIGN_IN_TERMS.divider}
        <span className="h-px flex-1 bg-border" />
      </div>
      <a
        href={googleSignInHref(next)}
        className={buttonClassName('secondary', 'w-full')}
      >
        <GoogleMark />
        {GOOGLE_SIGN_IN_TERMS.button}
      </a>
      <p className="text-center text-body-sm text-text-secondary">
        {GOOGLE_SIGN_IN_TERMS.consentPrefix}
        <Link href="/terms" className="text-primary hover:underline">
          {GOOGLE_SIGN_IN_TERMS.consentTerms}
        </Link>
        {GOOGLE_SIGN_IN_TERMS.consentJoin}
        <Link href="/privacy" className="text-primary hover:underline">
          {GOOGLE_SIGN_IN_TERMS.consentPrivacy}
        </Link>
        {GOOGLE_SIGN_IN_TERMS.consentEnd}
      </p>
    </div>
  );
}
