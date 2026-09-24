import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './components/RegisterForm';
import { ApiError, registerAccount } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, registerAccount: vi.fn() };
});

const registerAccountMock = vi.mocked(registerAccount);

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Пароль'), {
    target: { value: password },
  });
  fireEvent.click(
    screen.getByRole('button', { name: /Зарегистрироваться|Регистрация…/ }),
  );
}

describe('RegisterForm', () => {
  beforeEach(() => {
    registerAccountMock.mockReset();
  });

  it('shows client-side validation errors without calling the API', async () => {
    render(<RegisterForm />);

    fillAndSubmit('not-an-email', 'short');

    const emailInput = screen.getByLabelText('Email');
    const passwordInput = screen.getByLabelText('Пароль');
    await waitFor(() =>
      expect(emailInput).toHaveAttribute('aria-invalid', 'true'),
    );
    expect(passwordInput).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it('shows a pending state and disables the submit button while the request is in flight', async () => {
    let resolveRequest: (
      value: Awaited<ReturnType<typeof registerAccount>>,
    ) => void = () => {};
    registerAccountMock.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    const button = await screen.findByRole('button', { name: 'Регистрация…' });
    expect(button).toBeDisabled();

    resolveRequest({
      user: {
        id: '1',
        email: 'rider@example.com',
        emailVerified: false,
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
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
  });

  it('ignores a second submit while a request is already pending (duplicate-submit protection)', async () => {
    registerAccountMock.mockReturnValue(new Promise(() => {}));

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');
    await screen.findByRole('button', { name: 'Регистрация…' });

    // Button is disabled, but assert the guard directly too (belt and
    // suspenders — Enter-key resubmission bypasses a disabled button).
    fireEvent.submit(
      screen.getByRole('button', { name: 'Регистрация…' }).closest('form')!,
    );

    expect(registerAccountMock).toHaveBeenCalledOnce();
  });

  it('maps a 409 email_already_registered error onto the email field', async () => {
    registerAccountMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/email_already_registered',
        title: 'Email already registered',
        status: 409,
        detail: 'An account with this email already exists.',
        instance: '/v1/auth/register',
        code: 'email_already_registered',
      }),
    );

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(
      await screen.findByText('Аккаунт с таким email уже существует.'),
    ).toBeInTheDocument();
  });

  it('shows a generic error for an unmapped server failure', async () => {
    registerAccountMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/internal_error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
        instance: '/v1/auth/register',
        code: 'internal_error',
      }),
    );

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос.',
    );
  });

  it('shows the success state, including the dev-only verification link when present', async () => {
    registerAccountMock.mockResolvedValue({
      user: {
        id: '1',
        email: 'rider@example.com',
        emailVerified: false,
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
      verificationUrl: '/v1/auth/verify-email?token=abc123',
    });

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByText('Аккаунт создан')).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('shows the success state without a dev note when no verification URL is returned', async () => {
    registerAccountMock.mockResolvedValue({
      user: {
        id: '1',
        email: 'rider@example.com',
        emailVerified: false,
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

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByText('Аккаунт создан')).toBeInTheDocument();
    expect(
      screen.queryByText(/Только для этого окружения/),
    ).not.toBeInTheDocument();
  });
});
