'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  buttonClassName,
  GOOGLE_SIGN_IN_TERMS,
  OAUTH_SIGN_IN_TERMS,
  YANDEX_SIGN_IN_TERMS,
} from 'ui';
import { oauthSignInHref, type SignInProvider } from '../api';
import { GoogleMark } from './GoogleMark';
import { YandexMark } from './YandexMark';

const BUTTONS: ReadonlyArray<{
  provider: SignInProvider;
  label: string;
  mark: ReactNode;
}> = [
  {
    provider: 'yandex',
    label: YANDEX_SIGN_IN_TERMS.button,
    mark: <YandexMark />,
  },
  {
    provider: 'google',
    label: GOOGLE_SIGN_IN_TERMS.button,
    mark: <GoogleMark />,
  },
];

/**
 * CR-247 (ADR-034), CR-260 (ADR-037): «Войти через Яндекс» / «Войти через Google»
 * under the login/register form, keeping the page's `next`, with one divider and one
 * consent line for both. The page passes which providers the server has configured
 * (`../server-status.ts`); with none it renders nothing. Plain links: the API
 * redirects the whole page to the provider.
 */
export function OAuthSignIn({
  next = null,
  providers,
}: {
  next?: string | null;
  providers: Record<SignInProvider, boolean>;
}) {
  const buttons = BUTTONS.filter((button) => providers[button.provider]);
  if (buttons.length === 0) return null;
  return (
    <div className="flex flex-col gap-4" data-testid="oauth-sign-in">
      <div
        className="flex items-center gap-3 text-body-sm text-text-secondary"
        aria-hidden="true"
      >
        <span className="h-px flex-1 bg-border" />
        {OAUTH_SIGN_IN_TERMS.divider}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="flex flex-col gap-3">
        {buttons.map(({ provider, label, mark }) => (
          <a
            key={provider}
            href={oauthSignInHref(provider, next)}
            className={buttonClassName('secondary', 'w-full')}
          >
            {mark}
            {label}
          </a>
        ))}
      </div>
      <p className="text-center text-body-sm text-text-secondary">
        {OAUTH_SIGN_IN_TERMS.consentPrefix}
        <Link href="/terms" className="text-primary hover:underline">
          {OAUTH_SIGN_IN_TERMS.consentTerms}
        </Link>
        {OAUTH_SIGN_IN_TERMS.consentJoin}
        <Link href="/privacy" className="text-primary hover:underline">
          {OAUTH_SIGN_IN_TERMS.consentPrivacy}
        </Link>
        {OAUTH_SIGN_IN_TERMS.consentEnd}
      </p>
    </div>
  );
}
