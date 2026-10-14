'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  buttonClassName,
  cn,
  GOOGLE_SIGN_IN_TERMS,
  OAUTH_SIGN_IN_TERMS,
  YANDEX_SIGN_IN_TERMS,
} from 'ui';
import { oauthSignInHref, type SignInProvider } from '../api';
import { GoogleMark } from './GoogleMark';
import { YandexMark } from './YandexMark';

type Intent = 'login' | 'register';

const BUTTONS: ReadonlyArray<{
  provider: SignInProvider;
  label: Record<Intent, string>;
  mark: ReactNode;
}> = [
  {
    provider: 'yandex',
    label: {
      login: YANDEX_SIGN_IN_TERMS.button,
      register: YANDEX_SIGN_IN_TERMS.continueButton,
    },
    mark: <YandexMark />,
  },
  {
    provider: 'google',
    label: {
      login: GOOGLE_SIGN_IN_TERMS.button,
      register: GOOGLE_SIGN_IN_TERMS.continueButton,
    },
    mark: <GoogleMark />,
  },
];

/**
 * CR-262: `/register` as the auth mockup draws it — Google and Yandex ID side by
 * side from `sm` (one column on a phone), same size and weight, «Продолжить с …»,
 * above the email form. The page owns the divider and the consent line there.
 */
function RegisterButtons({
  next,
  providers,
}: {
  next: string | null;
  providers: Record<SignInProvider, boolean>;
}) {
  const buttons = [...BUTTONS]
    .reverse() // Google first, as in the mockup
    .filter((button) => providers[button.provider]);
  if (buttons.length === 0) return null;
  return (
    <div
      className={cn('grid gap-3', buttons.length > 1 && 'sm:grid-cols-2')}
      data-testid="oauth-sign-in"
    >
      {buttons.map(({ provider, label, mark }) => (
        <a
          key={provider}
          href={oauthSignInHref(provider, next)}
          // One line at two columns too, as in the mockup: no wrap, and the
          // smaller role plus `AuthSplitLayout`’s 30.5rem column keep
          // «Продолжить с Яндекс ID» whole.
          className={buttonClassName(
            'secondary',
            'w-full min-h-13 gap-2 whitespace-nowrap px-3 text-body-sm md:min-h-13',
          )}
        >
          {mark}
          {label.register}
        </a>
      ))}
    </div>
  );
}

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
  intent = 'login',
}: {
  next?: string | null;
  providers: Record<SignInProvider, boolean>;
  /** CR-262: `register` — the buttons only, laid out for `/register`. */
  intent?: Intent;
}) {
  if (intent === 'register') {
    return <RegisterButtons next={next} providers={providers} />;
  }
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
            {label.login}
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
