'use client';

import type { ReactNode } from 'react';
import {
  buttonClassName,
  cn,
  GOOGLE_SIGN_IN_TERMS,
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
  // Google first, as in the mockup.
  {
    provider: 'google',
    label: {
      login: GOOGLE_SIGN_IN_TERMS.button,
      register: GOOGLE_SIGN_IN_TERMS.continueButton,
    },
    mark: <GoogleMark />,
  },
  {
    provider: 'yandex',
    label: {
      login: YANDEX_SIGN_IN_TERMS.button,
      register: YANDEX_SIGN_IN_TERMS.continueButton,
    },
    mark: <YandexMark />,
  },
];

/**
 * CR-247 (ADR-034), CR-260 (ADR-037): the external sign-in buttons, keeping the
 * page's `next`. The page passes which providers the server has configured
 * (`../server-status.ts`); with none it renders nothing. Plain links: the API
 * redirects the whole page to the provider.
 *
 * CR-262 (`/register`), CR-264 (`/login`): laid out as the auth mockup draws both —
 * Google and Yandex ID side by side from `sm` (one column on a phone), same size and
 * weight, above the email form. `intent` picks the wording («Войти через …» /
 * «Продолжить с …»); the page owns the divider and the consent line.
 */
export function OAuthSignIn({
  next = null,
  providers,
  intent = 'login',
}: {
  next?: string | null;
  providers: Record<SignInProvider, boolean>;
  intent?: Intent;
}) {
  const buttons = BUTTONS.filter((button) => providers[button.provider]);
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
          {label[intent]}
        </a>
      ))}
    </div>
  );
}
