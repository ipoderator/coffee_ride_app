import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLegalConsents } from 'types';
import {
  AUTH_TERMS,
  LEGAL_CONSENT_TERMS,
  LEGAL_UPDATE_TERMS,
  OAUTH_SIGNUP_TERMS,
  UI_TERMS,
} from 'ui';
import {
  consentErrorMessage,
  LegalConsentFields,
} from '@/components/legal/LegalConsentFields';
import { OAuthSignupConsent } from '@/features/auth/oauth-signup/components/OAuthSignupConsent';
import { LegalUpdateForm } from '@/features/legal/reconsent/components/LegalUpdateForm';
import {
  isOpenDuringReconsent,
  LegalAcceptanceGate,
  returnTarget,
} from '@/lib/auth/LegalAcceptanceGate';
import { useSession } from '@/lib/auth/session-context';
import {
  PERSONAL_DATA_CONSENT_LABEL,
  TERMS_CONSENT_LABEL,
  tickConsents,
} from '@/test-support/consents';

// CR-269 (ADR-041): the consent boxes, the first-sign-in consent step, re-consent
// and the gate that sends a signed-in person to it.

const replace = vi.fn();
let pathname = '/rides';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace }),
}));
vi.mock('@/lib/auth/session-context', () => ({ useSession: vi.fn() }));
vi.mock('@/lib/api/current-user', () => ({ logout: vi.fn() }));

const useSessionMock = vi.mocked(useSession);
const fetchMock = vi.fn<typeof fetch>();
const assign = vi.fn();
const replaceLocation = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function problem(status: number, code: string): Response {
  return json({ type: 'x', title: 'x', status, detail: 'x', code }, status);
}

function session(
  status: 'loading' | 'authenticated' | 'anonymous',
  legalPending: Array<'terms' | 'personal_data_consent'> = [],
) {
  useSessionMock.mockReturnValue({
    status,
    user: null,
    legalPending,
    refresh: () => {},
  });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  replace.mockReset();
  assign.mockReset();
  replaceLocation.mockReset();
  pathname = '/rides';
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      ...window.location,
      assign,
      replace: replaceLocation,
      search: '?x=1',
      href: 'http://localhost/rides?x=1',
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LegalConsentFields', () => {
  it('renders one unticked, required box per document, each linking its own text in a new tab', () => {
    render(
      <LegalConsentFields
        idPrefix="t"
        documents={['terms', 'personal_data_consent']}
        value={{}}
        onChange={() => {}}
      />,
    );
    const terms = screen.getByLabelText(TERMS_CONSENT_LABEL);
    const data = screen.getByLabelText(PERSONAL_DATA_CONSENT_LABEL);
    for (const box of [terms, data]) {
      expect(box).not.toBeChecked();
      expect(box).toBeRequired();
      expect(box).toHaveAttribute('aria-describedby', 't-consent-hint');
    }
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual([
      '/terms',
      '/personal-data-consent',
      '/privacy',
    ]);
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      expect(link).toHaveTextContent(LEGAL_CONSENT_TERMS.newTab);
    }
    expect(screen.getByText(LEGAL_CONSENT_TERMS.hint(2))).toBeInTheDocument();
  });

  it('announces an API refusal and marks the boxes invalid', () => {
    render(
      <LegalConsentFields
        idPrefix="t"
        documents={['terms']}
        value={{ terms: true }}
        onChange={() => {}}
        error={LEGAL_CONSENT_TERMS.versionOutdated}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      LEGAL_CONSENT_TERMS.versionOutdated,
    );
    const box = screen.getByLabelText(TERMS_CONSENT_LABEL);
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(box).toHaveAttribute('aria-describedby', 't-consent-error');
  });

  it('maps the API consent refusals and nothing else', () => {
    expect(consentErrorMessage({ code: 'legal_version_outdated' })).toBe(
      LEGAL_CONSENT_TERMS.versionOutdated,
    );
    expect(consentErrorMessage({ code: 'consent_required' })).toBe(
      LEGAL_CONSENT_TERMS.consentRequired,
    );
    expect(
      consentErrorMessage({
        code: 'validation_error',
        errors: [{ path: 'consents.terms' }],
      }),
    ).toBe(LEGAL_CONSENT_TERMS.consentRequired);
    expect(
      consentErrorMessage({
        code: 'validation_error',
        errors: [{ path: 'email' }],
      }),
    ).toBeNull();
    expect(consentErrorMessage({ code: 'captcha_invalid' })).toBeNull();
  });
});

describe('OAuthSignupConsent', () => {
  it('names the provider and address, needs both boxes, then creates the account', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ provider: 'google', email: 'a@gmail.ru' }))
      .mockResolvedValueOnce(json({ next: '/rides/abc' }));
    render(<OAuthSignupConsent />);

    expect(
      await screen.findByText(OAUTH_SIGNUP_TERMS.lead('Google', 'a@gmail.ru')),
    ).toBeInTheDocument();
    const submit = screen.getByRole('button', {
      name: OAUTH_SIGNUP_TERMS.submit,
    });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(TERMS_CONSENT_LABEL));
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(PERSONAL_DATA_CONSENT_LABEL));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/rides/abc'));
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('/api/v1/auth/oauth-signup');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      consents: currentLegalConsents(),
    });
  });

  it('shows the expired state with a way back', async () => {
    fetchMock.mockResolvedValueOnce(problem(410, 'oauth_signup_expired'));
    render(<OAuthSignupConsent />);
    expect(
      await screen.findByRole('heading', {
        name: OAUTH_SIGNUP_TERMS.expiredTitle,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: OAUTH_SIGNUP_TERMS.expiredAction }),
    ).toHaveAttribute('href', '/register');
  });

  it('turns a used-up sign-up at submit into the expired state', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ provider: 'yandex', email: 'a@ya.ru' }))
      .mockResolvedValueOnce(problem(410, 'oauth_signup_expired'));
    render(<OAuthSignupConsent />);
    await screen.findByText(OAUTH_SIGNUP_TERMS.lead('Яндекс ID', 'a@ya.ru'));
    tickConsents();
    fireEvent.click(
      screen.getByRole('button', { name: OAUTH_SIGNUP_TERMS.submit }),
    );
    expect(
      await screen.findByText(OAUTH_SIGNUP_TERMS.expiredTitle),
    ).toBeInTheDocument();
    expect(assign).not.toHaveBeenCalled();
  });

  it('says why when the documents changed, and keeps the form', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ provider: 'yandex', email: 'a@ya.ru' }))
      .mockResolvedValueOnce(problem(409, 'legal_version_outdated'));
    render(<OAuthSignupConsent />);
    await screen.findByText(OAUTH_SIGNUP_TERMS.lead('Яндекс ID', 'a@ya.ru'));
    tickConsents();
    fireEvent.click(
      screen.getByRole('button', { name: OAUTH_SIGNUP_TERMS.submit }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      LEGAL_CONSENT_TERMS.versionOutdated,
    );
  });

  it('offers a retry when the pending sign-up cannot be read', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(500, 'internal_error'))
      .mockResolvedValueOnce(json({ provider: 'google', email: 'a@gmail.ru' }));
    render(<OAuthSignupConsent />);
    fireEvent.click(
      await screen.findByRole('button', { name: UI_TERMS.retry }),
    );
    expect(
      await screen.findByText(OAUTH_SIGNUP_TERMS.lead('Google', 'a@gmail.ru')),
    ).toBeInTheDocument();
  });

  it('keeps the form with a plain message when the account cannot be created', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ provider: 'google', email: 'a@gmail.ru' }))
      .mockResolvedValueOnce(problem(409, 'oauth_signup_failed'))
      .mockRejectedValueOnce(new TypeError('network down'));
    render(<OAuthSignupConsent />);
    await screen.findByText(OAUTH_SIGNUP_TERMS.lead('Google', 'a@gmail.ru'));
    tickConsents();
    const submit = screen.getByRole('button', {
      name: OAUTH_SIGNUP_TERMS.submit,
    });
    fireEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      OAUTH_SIGNUP_TERMS.failed,
    );

    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        AUTH_TERMS.genericError,
      ),
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('cancels: tells the server, then goes back to /register', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ provider: 'yandex', email: 'a@ya.ru' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    render(<OAuthSignupConsent />);
    await screen.findByText(OAUTH_SIGNUP_TERMS.lead('Яндекс ID', 'a@ya.ru'));
    fireEvent.click(
      screen.getByRole('button', { name: OAUTH_SIGNUP_TERMS.cancel }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/register'));
    expect(fetchMock.mock.calls[1]![1]?.method).toBe('DELETE');
  });
});

describe('LegalUpdateForm', () => {
  it('asks only for the pending documents and returns to next once accepted', async () => {
    session('authenticated', ['terms']);
    fetchMock.mockResolvedValueOnce(json({ pending: [] }));
    render(<LegalUpdateForm next="/rides/abc" />);

    expect(screen.getByLabelText(TERMS_CONSENT_LABEL)).toBeInTheDocument();
    expect(screen.queryByLabelText(PERSONAL_DATA_CONSENT_LABEL)).toBeNull();
    const submit = screen.getByRole('button', {
      name: LEGAL_UPDATE_TERMS.submit,
    });
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByLabelText(TERMS_CONSENT_LABEL));
    fireEvent.click(submit);

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/rides/abc'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/legal/acceptances');
    expect(JSON.parse(String(init?.body))).toEqual({
      consents: { terms: currentLegalConsents().terms },
    });
  });

  it('keeps sign-out and the deletion request open without accepting', () => {
    session('authenticated', ['terms', 'personal_data_consent']);
    render(<LegalUpdateForm next="/me" />);
    expect(
      screen.getByRole('button', { name: LEGAL_UPDATE_TERMS.logout }),
    ).toBeEnabled();
    expect(
      screen.getByRole('link', { name: LEGAL_UPDATE_TERMS.deleteLink }),
    ).toHaveAttribute('href', expect.stringMatching(/^mailto:.+\?subject=/));
  });

  it('carries on when nothing is pending (accepted in another tab)', async () => {
    session('authenticated', []);
    render(<LegalUpdateForm next="/me" />);
    await waitFor(() => expect(replaceLocation).toHaveBeenCalledWith('/me'));
  });
});

describe('LegalAcceptanceGate', () => {
  it('sends a signed-in person with pending documents to /legal-update, keeping the page', () => {
    session('authenticated', ['terms']);
    render(<LegalAcceptanceGate />);
    expect(replace).toHaveBeenCalledWith(
      `/legal-update?next=${encodeURIComponent('/rides?x=1')}`,
    );
  });

  // Browser check (CR-269): the session resolved while still on `/login`, whose
  // own URL is never a valid `next` — the return target is its `next`.
  it('keeps the sign-in target when the gate fires on /login', () => {
    expect(returnTarget('/login', '?next=%2Fme%2Fprofile')).toBe('/me/profile');
    expect(returnTarget('/login', '')).toBeNull();
    expect(
      returnTarget('/login', '?next=https%3A%2F%2Fevil.example'),
    ).toBeNull();
    expect(returnTarget('/rides/1', '?x=1')).toBe('/rides/1?x=1');
  });

  it.each(['/terms', '/privacy', '/personal-data-consent', '/legal-update'])(
    'leaves %s open',
    (path) => {
      pathname = path;
      session('authenticated', ['terms']);
      render(<LegalAcceptanceGate />);
      expect(replace).not.toHaveBeenCalled();
      expect(isOpenDuringReconsent(path)).toBe(true);
    },
  );

  it('does nothing while loading, signed out, or with nothing pending', () => {
    for (const [status, pending] of [
      ['loading', ['terms']],
      ['anonymous', []],
      ['authenticated', []],
    ] as const) {
      session(status, [...pending]);
      act(() => {
        render(<LegalAcceptanceGate />);
      });
    }
    expect(replace).not.toHaveBeenCalled();
  });
});
