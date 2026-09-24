import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VerifyEmailStatus } from './components/VerifyEmailStatus';
import { ApiError, verifyEmail } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, verifyEmail: vi.fn() };
});

const verifyEmailMock = vi.mocked(verifyEmail);

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
});
