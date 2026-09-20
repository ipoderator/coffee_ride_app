import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResetPasswordForm } from './components/ResetPasswordForm';
import { ApiError, resetPassword } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, resetPassword: vi.fn() };
});

const resetPasswordMock = vi.mocked(resetPassword);

function fillAndSubmit(password: string) {
  fireEvent.change(screen.getByLabelText('Новый пароль'), {
    target: { value: password },
  });
  fireEvent.click(
    screen.getByRole('button', { name: /Сохранить новый пароль|Сохранение…/ }),
  );
}

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    resetPasswordMock.mockReset();
  });

  it('shows a missing-token error without rendering the form when no token is present', () => {
    render(<ResetPasswordForm token={null} />);

    expect(
      screen.getByText('Ссылка неполная — отсутствует код сброса.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Новый пароль')).not.toBeInTheDocument();
  });

  it('submits the token and new password, then shows success', async () => {
    resetPasswordMock.mockResolvedValue({
      user: {
        id: '1',
        email: 'rider@example.com',
        emailVerified: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        displayName: null,
        phone: null,
        bio: null,
        avatarUrl: null,
      },
    });

    render(<ResetPasswordForm token="reset-token-123" />);
    fillAndSubmit('a-strong-new-password-123');

    expect(await screen.findByText('Пароль изменён')).toBeInTheDocument();
    expect(resetPasswordMock).toHaveBeenCalledWith({
      token: 'reset-token-123',
      password: 'a-strong-new-password-123',
    });
  });

  it('shows an invalid/expired message for a rejected token', async () => {
    resetPasswordMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/reset_token_expired',
        title: 'Reset link expired',
        status: 400,
        detail: 'This password reset link has expired.',
        instance: '/v1/auth/reset-password',
        code: 'reset_token_expired',
      }),
    );

    render(<ResetPasswordForm token="expired-token" />);
    fillAndSubmit('a-strong-new-password-123');

    expect(
      await screen.findByText(
        /Ссылка недействительна или уже была использована/,
      ),
    ).toBeInTheDocument();
  });

  it('shows client-side validation for a too-short password without calling the API', async () => {
    render(<ResetPasswordForm token="reset-token-123" />);
    fillAndSubmit('short');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });
});
