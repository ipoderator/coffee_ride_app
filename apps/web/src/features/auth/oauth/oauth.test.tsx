import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_SIGN_IN_OUTCOMES, YANDEX_SIGN_IN_OUTCOMES } from 'types';
import { GOOGLE_SIGN_IN_TERMS, LEGAL_TERMS, YANDEX_SIGN_IN_TERMS } from 'ui';
import { OAuthOutcomeAlert } from './components/OAuthOutcomeAlert';
import { OAuthSignIn } from './components/OAuthSignIn';
import { oauthSignInHref, parseOAuthOutcome } from './api';
import { isSignInProviderAvailable, signInProviders } from './server-status';
import { LegalDocument } from '@/features/legal/components/LegalDocument';
import {
  LEGAL_CONTACT_EMAIL,
  PRIVACY_POLICY,
  TERMS_OF_USE,
} from '@/features/legal/content';

// CR-247 (ADR-034), CR-260 (ADR-037): «Войти через Google» / «Войти через Яндекс»
// on /login and /register.

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('oauthSignInHref', () => {
  it.each(['google', 'yandex'] as const)(
    '%s: carries a safe next and drops an unsafe one',
    (provider) => {
      const start = `/api/v1/auth/${provider}`;
      expect(oauthSignInHref(provider, '/rides/abc?x=1')).toBe(
        `${start}?next=%2Frides%2Fabc%3Fx%3D1`,
      );
      expect(oauthSignInHref(provider, null)).toBe(start);
      for (const unsafe of [
        '//evil.example',
        'https://evil.example',
        '/login',
      ]) {
        expect(oauthSignInHref(provider, unsafe)).toBe(start);
      }
    },
  );
});

describe('parseOAuthOutcome', () => {
  it('reads a provider-less outcome as Google (CR-247 links)', () => {
    for (const outcome of GOOGLE_SIGN_IN_OUTCOMES) {
      expect(parseOAuthOutcome({ oauth: outcome })).toEqual({
        provider: 'google',
        outcome,
      });
    }
    expect(parseOAuthOutcome({ oauth: 'state', provider: 'google' })).toEqual({
      provider: 'google',
      outcome: 'state',
    });
  });

  it('reads provider=yandex with the Yandex outcomes only', () => {
    for (const outcome of YANDEX_SIGN_IN_OUTCOMES) {
      expect(parseOAuthOutcome({ oauth: outcome, provider: 'yandex' })).toEqual(
        { provider: 'yandex', outcome },
      );
    }
    expect(
      parseOAuthOutcome({ oauth: 'account_unverified', provider: 'yandex' }),
    ).toBeNull();
  });

  it('refuses anything else', () => {
    expect(parseOAuthOutcome({ oauth: '<script>' })).toBeNull();
    expect(parseOAuthOutcome({ oauth: ['state'] })).toBeNull();
    expect(parseOAuthOutcome({})).toBeNull();
    expect(parseOAuthOutcome({ oauth: 'state', provider: 'evil' })).toBeNull();
    expect(
      parseOAuthOutcome({ oauth: 'state', provider: ['yandex'] }),
    ).toBeNull();
  });
});

describe('isSignInProviderAvailable / signInProviders', () => {
  it('asks the API server to server, per provider', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ available: true }));
    expect(await isSignInProviderAvailable('yandex')).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /\/v1\/auth\/yandex\/status$/,
    );

    fetchMock.mockImplementation(async (input) =>
      Response.json({ available: String(input).includes('/google/') }),
    );
    expect(await signInProviders()).toEqual({ google: true, yandex: false });
  });

  it('fails soft to unavailable', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await isSignInProviderAvailable('google')).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await isSignInProviderAvailable('yandex')).toBe(false);
  });
});

describe('OAuthSignIn', () => {
  it('links both providers to the API start with next, Google first', () => {
    render(
      <OAuthSignIn
        next="/rides/abc"
        providers={{ google: true, yandex: true }}
      />,
    );

    expect(
      screen.getByRole('link', { name: YANDEX_SIGN_IN_TERMS.button }),
    ).toHaveAttribute('href', '/api/v1/auth/yandex?next=%2Frides%2Fabc');
    expect(
      screen.getByRole('link', { name: GOOGLE_SIGN_IN_TERMS.button }),
    ).toHaveAttribute('href', '/api/v1/auth/google?next=%2Frides%2Fabc');
    // CR-264: the mockup's order; the page owns the divider and consent line.
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      [GOOGLE_SIGN_IN_TERMS.button, YANDEX_SIGN_IN_TERMS.button],
    );
  });

  it('words the buttons for /register with «Продолжить с …»', () => {
    render(
      <OAuthSignIn
        providers={{ google: true, yandex: true }}
        intent="register"
      />,
    );
    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(
      [
        GOOGLE_SIGN_IN_TERMS.continueButton,
        YANDEX_SIGN_IN_TERMS.continueButton,
      ],
    );
  });

  it('shows only the configured providers, and nothing without any', () => {
    const { rerender, container } = render(
      <OAuthSignIn providers={{ google: false, yandex: true }} />,
    );
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(
      screen.queryByRole('link', { name: GOOGLE_SIGN_IN_TERMS.button }),
    ).toBeNull();

    rerender(<OAuthSignIn providers={{ google: false, yandex: false }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('OAuthOutcomeAlert', () => {
  it('shows the outcome of the provider in Russian, and nothing without one', () => {
    const { rerender, container } = render(
      <OAuthOutcomeAlert result={{ provider: 'yandex', outcome: 'state' }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      YANDEX_SIGN_IN_TERMS.outcome.state,
    );
    rerender(
      <OAuthOutcomeAlert result={{ provider: 'google', outcome: 'state' }} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      GOOGLE_SIGN_IN_TERMS.outcome.state,
    );
    rerender(<OAuthOutcomeAlert result={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('LegalDocument', () => {
  it.each([
    [LEGAL_TERMS.privacyTitle, PRIVACY_POLICY],
    [LEGAL_TERMS.termsTitle, TERMS_OF_USE],
  ])(
    '%s has one h1, its sections, the dated wording and the contact',
    (title, content) => {
      const html = renderToStaticMarkup(
        <LegalDocument title={title} content={content} />,
      );
      expect(html.match(/<h1/g)).toHaveLength(1);
      expect(html.match(/<h2/g)).toHaveLength(content.sections.length);
      expect(html).toContain('14 октября 2026');
      expect(html).toContain(`mailto:${LEGAL_CONTACT_EMAIL}`);
    },
  );

  it('the privacy policy covers data, sessions, deletion, Google and Yandex', () => {
    const text = JSON.stringify(PRIVACY_POLICY);
    for (const topic of [
      'Cookies и сессии',
      'Удаление аккаунта',
      'Google',
      'Яндекс ID',
      'yandex-oauth',
      'Strava',
    ]) {
      expect(text).toContain(topic);
    }
  });
});
