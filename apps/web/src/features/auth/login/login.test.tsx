import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from 'types';
import { CabinetShell } from '@/components/cabinet/CabinetShell';
import { getCurrentUser } from '@/lib/api/current-user';
import { SessionProvider } from '@/lib/auth/session-context';
import { LoginForm } from './components/LoginForm';
import { ApiError, login } from './api';

const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: replaceMock, push: vi.fn() }),
}));

vi.mock('@/lib/api/current-user', () => ({
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));

const getCurrentUserMock = vi.mocked(getCurrentUser);

const signedOut = () =>
  new ApiError({
    type: 'https://coffee-ride.example/errors/unauthorized',
    title: 'Unauthorized',
    status: 401,
    detail: 'No active session.',
    instance: '/v1/auth/me',
    code: 'unauthorized',
  });

const user: User = {
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
};

function renderForm() {
  return render(
    <SessionProvider>
      <LoginForm />
    </SessionProvider>,
  );
}

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
    getCurrentUserMock.mockReset();
    getCurrentUserMock.mockRejectedValue(signedOut());
  });

  it('shows client-side validation errors without calling the API', async () => {
    renderForm();

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

    renderForm();
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    const button = await screen.findByRole('button', { name: 'Вход…' });
    expect(button).toBeDisabled();
  });

  it('ignores a second submit while a request is already pending', async () => {
    loginMock.mockReturnValue(new Promise(() => {}));

    renderForm();
    fillAndSubmit('rider@example.com', 'a-strong-password-123');
    await screen.findByRole('button', { name: 'Вход…' });

    fireEvent.submit(
      screen.getByRole('button', { name: 'Вход…' }).closest('form')!,
    );

    expect(loginMock).toHaveBeenCalledOnce();
  });

  it('redirects to /me on success', async () => {
    loginMock.mockResolvedValue({ user });

    renderForm();
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/me'));
  });

  // Regression (CR-127): the shared session stayed `anonymous` after a
  // successful login, so the cabinet gate bounced straight back to `/login`.
  it('lands in the cabinet instead of bouncing back to /login', async () => {
    let navigate: (path: string) => void = () => {};
    function Harness() {
      const [path, setPath] = useState('/login');
      navigate = setPath;
      return path === '/login' ? (
        <LoginForm />
      ) : (
        <CabinetShell>
          <p>Содержимое кабинета</p>
        </CabinetShell>
      );
    }
    replaceMock.mockImplementation((path: string) => navigate(path));
    loginMock.mockResolvedValue({ user });

    render(
      <SessionProvider>
        <Harness />
      </SessionProvider>,
    );
    await waitFor(() => expect(getCurrentUserMock).toHaveBeenCalledOnce());
    getCurrentUserMock.mockResolvedValue({ user });

    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByText('Содержимое кабинета')).toBeInTheDocument();
    expect(replaceMock).not.toHaveBeenCalledWith('/login');
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

    renderForm();
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

    renderForm();
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос.',
    );
  });
});
