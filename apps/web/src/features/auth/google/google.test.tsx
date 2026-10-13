import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GOOGLE_SIGN_IN_OUTCOMES } from 'types';
import { GOOGLE_SIGN_IN_TERMS, LEGAL_TERMS } from 'ui';
import { GoogleOutcomeAlert } from './components/GoogleOutcomeAlert';
import { GoogleSignIn } from './components/GoogleSignIn';
import { googleSignInHref, parseGoogleOutcome } from './api';
import { isGoogleSignInAvailable } from './server-status';
import { LegalDocument } from '@/features/legal/components/LegalDocument';
import {
  LEGAL_CONTACT_EMAIL,
  PRIVACY_POLICY,
  TERMS_OF_USE,
} from '@/features/legal/content';

// CR-247 (ADR-034): «Войти через Google» on /login and /register.

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe('googleSignInHref', () => {
  it('carries a safe next and drops an unsafe one', () => {
    expect(googleSignInHref('/rides/abc?x=1')).toBe(
      '/api/v1/auth/google?next=%2Frides%2Fabc%3Fx%3D1',
    );
    expect(googleSignInHref(null)).toBe('/api/v1/auth/google');
    for (const unsafe of ['//evil.example', 'https://evil.example', '/login']) {
      expect(googleSignInHref(unsafe)).toBe('/api/v1/auth/google');
    }
  });
});

describe('parseGoogleOutcome', () => {
  it('accepts only the known outcomes', () => {
    for (const outcome of GOOGLE_SIGN_IN_OUTCOMES) {
      expect(parseGoogleOutcome(outcome)).toBe(outcome);
    }
    expect(parseGoogleOutcome('<script>')).toBeNull();
    expect(parseGoogleOutcome(['state'])).toBeNull();
    expect(parseGoogleOutcome(undefined)).toBeNull();
  });
});

describe('isGoogleSignInAvailable', () => {
  it('asks the API server to server', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ available: true }));
    expect(await isGoogleSignInAvailable()).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /\/v1\/auth\/google\/status$/,
    );
    fetchMock.mockResolvedValueOnce(Response.json({ available: false }));
    expect(await isGoogleSignInAvailable()).toBe(false);
  });

  it('fails soft to unavailable', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await isGoogleSignInAvailable()).toBe(false);
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    expect(await isGoogleSignInAvailable()).toBe(false);
  });
});

describe('GoogleSignIn', () => {
  it('links to the API start with next, and to the terms and privacy pages', () => {
    render(<GoogleSignIn next="/rides/abc" />);

    const link = screen.getByRole('link', {
      name: GOOGLE_SIGN_IN_TERMS.button,
    });
    expect(link).toHaveAttribute(
      'href',
      '/api/v1/auth/google?next=%2Frides%2Fabc',
    );
    expect(
      screen.getByRole('link', { name: GOOGLE_SIGN_IN_TERMS.consentTerms }),
    ).toHaveAttribute('href', '/terms');
    expect(
      screen.getByRole('link', { name: GOOGLE_SIGN_IN_TERMS.consentPrivacy }),
    ).toHaveAttribute('href', '/privacy');
  });
});

describe('GoogleOutcomeAlert', () => {
  it('shows the outcome in Russian, and nothing without one', () => {
    const { rerender, container } = render(
      <GoogleOutcomeAlert outcome="state" />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      GOOGLE_SIGN_IN_TERMS.outcome.state,
    );
    rerender(<GoogleOutcomeAlert outcome={null} />);
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
      expect(html).toContain('13 октября 2026');
      expect(html).toContain(`mailto:${LEGAL_CONTACT_EMAIL}`);
    },
  );

  it('the privacy policy covers data, sessions, deletion and Google', () => {
    const text = JSON.stringify(PRIVACY_POLICY);
    for (const topic of [
      'Cookies и сессии',
      'Удаление аккаунта',
      'Google',
      'Strava',
    ]) {
      expect(text).toContain(topic);
    }
  });
});
