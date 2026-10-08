import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RegisterForm } from './components/RegisterForm';
import { ApiError, registerAccount } from './api';
import {
  ENGLISH_API_TEXTS,
  englishProblem,
  expectNoEnglishApiText,
} from '@/test-support/english-problem';

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

  // CR-194 (QA 13653ed): the page used to show the schema's English
  // «Invalid email address» / «Password must be at least 12 characters.».
  it('words an empty form in Russian, never the schema’s English', async () => {
    render(<RegisterForm />);

    fireEvent.click(screen.getByRole('button', { name: 'Зарегистрироваться' }));

    expect(
      await screen.findByText('Введите email, например name@example.ru.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Не короче 12 символов.')).toBeInTheDocument();
    expect(screen.queryByText('Invalid email address')).not.toBeInTheDocument();
    expectNoEnglishApiText();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it('words an invalid email and a short password in Russian', async () => {
    render(<RegisterForm />);

    fillAndSubmit('not-an-email', 'short');

    expect(
      await screen.findByText('Введите email, например name@example.ru.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Не короче 12 символов.')).toBeInTheDocument();
    expect(
      screen.queryByText(ENGLISH_API_TEXTS.password),
    ).not.toBeInTheDocument();
    expectNoEnglishApiText();
  });

  it('shows Russian for a server field error and keeps the API’s English off the screen', async () => {
    registerAccountMock.mockRejectedValue(
      englishProblem('validation_error', {
        status: 400,
        fields: ['email', 'password'],
      }),
    );

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findAllByText('Проверьте это поле.')).toHaveLength(2);
    expectNoEnglishApiText();
  });

  it('shows the generic Russian line for a code it does not know', async () => {
    registerAccountMock.mockRejectedValue(
      englishProblem('some_new_server_code', { status: 418 }),
    );

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выполнить запрос. Попробуйте ещё раз.',
    );
    expectNoEnglishApiText();
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

  it('does not ask to check the inbox when the account is created already verified (CR-220)', async () => {
    registerAccountMock.mockResolvedValue({
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

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(
      await screen.findByText(
        'Подтверждать почту не нужно — можно сразу войти.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Проверьте почту/)).not.toBeInTheDocument();
  });

  // CR-141 (KI-064): registering doesn't sign in, so `next` is handed on to
  // /login — from the form and from the success card.
  it('keeps `next` on the links to /login', async () => {
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

    render(<RegisterForm next="/rides/ride-1" />);
    expect(
      screen.getByRole('link', { name: 'Уже есть аккаунт? Войти' }),
    ).toHaveAttribute('href', '/login?next=%2Frides%2Fride-1');

    fillAndSubmit('rider@example.com', 'a-strong-password-123');
    await screen.findByText('Аккаунт создан');
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/login?next=%2Frides%2Fride-1',
    );
  });

  // CR-197 (QA `fe0b4c2`): the dev verification link dropped `next`, so the
  // verified page's «Перейти ко входу» landed on `/me` instead of the ride.
  it.each([
    ['/rides/ride-1', '/verify-email?token=tok-1&next=%2Frides%2Fride-1'],
    ['https://evil.example/rides', '/verify-email?token=tok-1'],
    ['//evil.example', '/verify-email?token=tok-1'],
  ])(
    'carries only a safe `next` (%s) into the verification link',
    async (next, expected) => {
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
        verificationUrl: '/v1/auth/verify-email?token=tok-1',
      });

      render(<RegisterForm next={next} />);
      fillAndSubmit('rider@example.com', 'a-strong-password-123');

      expect(
        await screen.findByRole('link', { name: expected }),
      ).toHaveAttribute('href', expected);
    },
  );
});
