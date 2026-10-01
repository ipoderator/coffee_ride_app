import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/errors';
import { resendVerificationEmail } from '@/lib/api/current-user';
import { ResendVerificationButton } from './ResendVerificationButton';
import {
  useOptionalSession,
  type SessionState,
  type SessionStatus,
} from './session-context';

// CR-168 (KI-026). The affordance under test is the only in-app way out of an
// unverified-email dead end, so these cover its states directly rather than
// through one of the three forms that embed it.
vi.mock('@/lib/api/current-user', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api/current-user')>(
    '@/lib/api/current-user',
  );
  return { ...actual, resendVerificationEmail: vi.fn() };
});

const resendMock = vi.mocked(resendVerificationEmail);

// The real `SessionProvider` would fetch `/v1/auth/me`; these tests care about
// what the button does per resolved session state, so the context value is
// supplied directly.
vi.mock('./session-context', async () => {
  const actual =
    await vi.importActual<typeof import('./session-context')>(
      './session-context',
    );
  return { ...actual, useOptionalSession: vi.fn() };
});

const sessionMock = vi.mocked(useOptionalSession);

function session(status: SessionStatus): SessionState {
  return { status, user: null, refresh: () => {} };
}

function problem(status: number, code: string) {
  return new ApiError({
    type: `https://coffee-ride.example/errors/${code}`,
    title: 'Error',
    status,
    detail: 'Something went wrong.',
    instance: '/v1/auth/resend-verification',
    code,
  });
}

describe('ResendVerificationButton', () => {
  beforeEach(() => {
    resendMock.mockReset();
    sessionMock.mockReset();
  });

  it('sends a new verification email and reports success', async () => {
    sessionMock.mockReturnValue(session('authenticated'));
    resendMock.mockResolvedValue(undefined);

    render(<ResendVerificationButton />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Отправить письмо повторно' }),
    );

    expect(
      await screen.findByText(/Письмо отправлено/, { exact: false }),
    ).toBeInTheDocument();
    expect(resendMock).toHaveBeenCalledTimes(1);
  });

  it('retires the button after a successful send so the new link is not immediately invalidated', async () => {
    sessionMock.mockReturnValue(session('authenticated'));
    resendMock.mockResolvedValue(undefined);

    render(<ResendVerificationButton />);
    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => {
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  it('shows a wait-a-minute message on a 429 rather than the generic error', async () => {
    sessionMock.mockReturnValue(session('authenticated'));
    resendMock.mockRejectedValue(problem(429, 'account_rate_limited'));

    render(<ResendVerificationButton />);
    fireEvent.click(screen.getByRole('button'));

    expect(
      await screen.findByText(/Слишком много запросов/, { exact: false }),
    ).toBeInTheDocument();
    // Still retryable, unlike the success case.
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('shows the generic error for any other failure, and stays retryable', async () => {
    sessionMock.mockReturnValue(session('authenticated'));
    resendMock.mockRejectedValue(new Error('network down'));

    render(<ResendVerificationButton />);
    fireEvent.click(screen.getByRole('button'));

    expect(
      await screen.findByText(/Не удалось отправить письмо/, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('tells an anonymous viewer to sign in instead of offering a button that could only 401', () => {
    sessionMock.mockReturnValue(session('anonymous'));

    render(<ResendVerificationButton />);

    expect(
      screen.getByText('Войдите в аккаунт, чтобы запросить новое письмо.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing while the session is still resolving', () => {
    sessionMock.mockReturnValue(session('loading'));

    const { container } = render(<ResendVerificationButton />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing, rather than throwing, when no SessionProvider is above it', () => {
    // Guards the regression this component caused when first written: it used
    // `useSession()`, which throws without a provider — taking down the whole
    // organizer form it sits inside, not just this button.
    sessionMock.mockReturnValue(null);

    const { container } = render(<ResendVerificationButton />);

    expect(container).toBeEmptyDOMElement();
  });

  it('does not fire a second request while one is in flight', async () => {
    sessionMock.mockReturnValue(session('authenticated'));
    let release: (() => void) | undefined;
    resendMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    render(<ResendVerificationButton />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    // `Button`'s own `isLoading` disables it; assert the effect, not the prop.
    await waitFor(() => {
      expect(button).toBeDisabled();
    });
    // A second click while disabled must not reach the API.
    fireEvent.click(button);

    release?.();
    await waitFor(() => {
      expect(resendMock).toHaveBeenCalledTimes(1);
    });
  });
});
