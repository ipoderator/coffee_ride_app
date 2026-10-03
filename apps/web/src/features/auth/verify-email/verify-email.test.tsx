import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VerifyEmailPage from '@/app/verify-email/page';
import { VerifyEmailStatus } from './components/VerifyEmailStatus';
import { ApiError, verifyEmail } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, verifyEmail: vi.fn() };
});

const verifyEmailMock = vi.mocked(verifyEmail);

const verifiedUser = {
  id: '1',
  email: 'rider@example.com',
  emailVerified: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  displayName: null,
  firstName: null,
  lastName: null,
  phone: null,
  bio: null,
  avatarUrl: null,
  profileVisibility: 'co_participants' as const,
  distanceWeekKm: null,
  distanceMonthKm: null,
  distanceYearKm: null,
};

describe('VerifyEmailStatus', () => {
  beforeEach(() => {
    verifyEmailMock.mockReset();
  });

  it('shows a missing-token error without calling the API when no token is present', () => {
    render(<VerifyEmailStatus token={null} />);

    expect(
      screen.getByText('Ссылка неполная — отсутствует код подтверждения.'),
    ).toBeInTheDocument();
    expect(verifyEmailMock).not.toHaveBeenCalled();
  });

  it('calls the API with the token and shows success', async () => {
    verifyEmailMock.mockResolvedValue({
      user: {
        id: '1',
        email: 'rider@example.com',
        emailVerified: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        displayName: null,
        firstName: null,
        lastName: null,
        phone: null,
        bio: null,
        avatarUrl: null,
        profileVisibility: 'co_participants',
        distanceWeekKm: null,
        distanceMonthKm: null,
        distanceYearKm: null,
      },
    });

    render(<VerifyEmailStatus token="abc123" />);

    expect(await screen.findByText('Email подтверждён')).toBeInTheDocument();
    expect(verifyEmailMock).toHaveBeenCalledWith({ token: 'abc123' });
  });

  it('shows an invalid/expired message for a rejected token', async () => {
    verifyEmailMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/verification_token_expired',
        title: 'Verification link expired',
        status: 400,
        detail: 'This verification link has expired.',
        instance: '/v1/auth/verify-email',
        code: 'verification_token_expired',
      }),
    );

    render(<VerifyEmailStatus token="expired-token" />);

    await waitFor(() =>
      expect(
        screen.getByText(/Ссылка недействительна или уже была использована/),
      ).toBeInTheDocument(),
    );
  });

  // CR-197 (QA `fe0b4c2`): «Перейти ко входу» went to a bare `/login`, so a
  // visitor who registered from a ride landed on `/me` after signing in.
  describe('the return target (`?next=`)', () => {
    async function renderPage(next: string | string[] | undefined) {
      verifyEmailMock.mockResolvedValue({ user: verifiedUser });
      render(
        await VerifyEmailPage({
          searchParams: Promise.resolve({ token: 'abc123', next }),
        }),
      );
      return screen.findByRole('link', { name: 'Перейти ко входу' });
    }

    it('carries a safe internal path to the login link', async () => {
      expect(await renderPage('/rides/ride-1')).toHaveAttribute(
        'href',
        '/login?next=%2Frides%2Fride-1',
      );
    });

    it.each([
      ['an absolute URL', 'https://evil.example/rides'],
      ['a protocol-relative URL', '//evil.example'],
      ['a backslash URL', '/\\evil.example'],
      ['javascript:', 'javascript:alert(1)'],
      ['an auth page', '/login'],
      ['the verify page itself', '/verify-email?token=other'],
      ['a repeated parameter', ['/rides/a', '/rides/b']],
      ['nothing', undefined],
    ])('drops %s', async (_label, next) => {
      expect(await renderPage(next)).toHaveAttribute('href', '/login');
    });
  });
});
