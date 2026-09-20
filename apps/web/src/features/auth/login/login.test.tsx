import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginForm } from './components/LoginForm';
import { ApiError, login } from './api';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, login: vi.fn() };
});

const loginMock = vi.mocked(login);

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Пароль'), {
    target: { value: password },
  });
  fireEvent.click(screen.getByRole('button', { name: /Войти|Вход…/ }));
}

describe('LoginForm', () => {
  beforeEach(() => {
    loginMock.mockReset();
    replaceMock.mockReset();
  });

  it('shows client-side validation errors without calling the API', async () => {
    render(<LoginForm />);

    fillAndSubmit('not-an-email', '');

    await waitFor(() =>
      expect(screen.getByLabelText('Email')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('shows a pending state and disables the submit button while in flight', async () => {
    loginMock.mockReturnValue(new Promise(() => {}));

    render(<LoginForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    const button = await screen.findByRole('button', { name: 'Вход…' });
    expect(button).toBeDisabled();
  });

  it('ignores a second submit while a request is already pending', async () => {
    loginMock.mockReturnValue(new Promise(() => {}));

    render(<LoginForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');
    await screen.findByRole('button', { name: 'Вход…' });

    fireEvent.submit(
      screen.getByRole('button', { name: 'Вход…' }).closest('form')!,
    );

    expect(loginMock).toHaveBeenCalledOnce();
  });

  it('redirects to /me on success', async () => {
    loginMock.mockResolvedValue({
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

    render(<LoginForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/me'));
  });

  it('shows one generic message for both a wrong password and an unknown email (no account enumeration)', async () => {
    loginMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/invalid_credentials',
        title: 'Invalid credentials',
        status: 401,
        detail: 'Incorrect email or password.',
        instance: '/v1/auth/login',
        code: 'invalid_credentials',
      }),
    );

    render(<LoginForm />);
    fillAndSubmit('rider@example.com', 'the-wrong-password');

    expect(
      await screen.findByText('Неверный email или пароль.'),
    ).toBeInTheDocument();
    // Neither field is individually marked invalid — that would itself leak
    // which one was wrong.
    expect(screen.getByLabelText('Email')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByLabelText('Пароль')).not.toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('shows a generic error for an unmapped server failure', async () => {
    loginMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/internal_error',
        title: 'Internal Server Error',
        status: 500,
        detail: 'An unexpected error occurred.',
        instance: '/v1/auth/login',
        code: 'internal_error',
      }),
    );

    render(<LoginForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос.',
    );
  });
});
