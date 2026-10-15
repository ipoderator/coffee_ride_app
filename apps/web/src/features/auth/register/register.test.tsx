import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentLegalConsents } from 'types';
import { RegisterForm } from './components/RegisterForm';
import { ApiError, registerAccount } from './api';
import { installFakeGrecaptcha } from '../captcha/fake-grecaptcha';
import { tickConsents } from '@/test-support/consents';
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

function fillAndSubmit(
  email: string,
  password: string,
  confirmPassword = password,
) {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText('Пароль'), {
    target: { value: password },
  });
  fireEvent.change(screen.getByLabelText('Повторите пароль'), {
    target: { value: confirmPassword },
  });
  if (!screen.getByLabelText(/Я принимаю условия/).matches(':checked')) {
    tickConsents();
  }
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

    tickConsents();
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
      emailVerificationRequired: true,
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

  // CR-262 (ADR-039): the API answers a taken email like a new one, so the card
  // never says whether the address already had an account.
  it('shows one neutral success card naming the address, whether new or taken', async () => {
    registerAccountMock.mockResolvedValue({ emailVerificationRequired: true });

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    const card = await screen.findByRole('status');
    expect(card).toHaveTextContent('Проверьте почту');
    expect(card).toHaveTextContent('Мы отправили письмо на rider@example.com.');
    expect(card).toHaveTextContent(
      'Если аккаунт с этим адресом уже есть, в письме будет ссылка для входа.',
    );
    expect(card).not.toHaveTextContent(/уже существует|создан/);
  });

  it('maps a server refusal of confirmPassword onto the confirm field', async () => {
    registerAccountMock.mockRejectedValue(
      englishProblem('validation_error', {
        status: 400,
        fields: ['confirmPassword'],
      }),
    );

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByText('Пароли не совпадают.')).toBeInTheDocument();
    expect(screen.getByLabelText('Повторите пароль')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expectNoEnglishApiText();
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
      emailVerificationRequired: true,
      verificationUrl: '/v1/auth/verify-email?token=abc123',
    });

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByText('Проверьте почту')).toBeInTheDocument();
    expect(screen.getByText(/abc123/)).toBeInTheDocument();
  });

  it('shows the success state without a dev note when no verification URL is returned', async () => {
    registerAccountMock.mockResolvedValue({
      emailVerificationRequired: true,
    });

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByText('Проверьте почту')).toBeInTheDocument();
    expect(
      screen.queryByText(/Только для этого окружения/),
    ).not.toBeInTheDocument();
  });

  it('does not ask to check the inbox when the account is created already verified (CR-220)', async () => {
    registerAccountMock.mockResolvedValue({
      emailVerificationRequired: false,
    });

    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(await screen.findByText('Готово')).toBeInTheDocument();
    expect(
      screen.getByText(/Подтверждать почту не нужно — можно сразу войти\./),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Проверьте почту/)).not.toBeInTheDocument();
  });

  // CR-141 (KI-064): registering doesn't sign in, so `next` is handed on to
  // /login from the success card (CR-262: the page's «Уже есть аккаунт?» line
  // carries it too — `register-page.test.tsx`).
  it('keeps `next` on the success card’s link to /login', async () => {
    registerAccountMock.mockResolvedValue({
      emailVerificationRequired: true,
    });

    render(<RegisterForm next="/rides/ride-1" />);

    fillAndSubmit('rider@example.com', 'a-strong-password-123');
    await screen.findByText('Проверьте почту');
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute(
      'href',
      '/login?next=%2Frides%2Fride-1',
    );
  });

  // CR-197 (QA `fe0b4c2`): the dev verification link dropped `next`, so the
  // verified page's «Перейти ко входу» landed on `/me` instead of the ride.
  // CR-244 (KI-089): the same safe `next` goes to the API, which appends it to
  // the emailed link; an unsafe one is not sent at all.
  it.each([
    [
      '/rides/ride-1',
      '/verify-email?token=tok-1&next=%2Frides%2Fride-1',
      '/rides/ride-1',
    ],
    ['https://evil.example/rides', '/verify-email?token=tok-1', undefined],
    ['//evil.example', '/verify-email?token=tok-1', undefined],
  ])(
    'carries only a safe `next` (%s) into the verification link',
    async (next, expected, sentNext) => {
      registerAccountMock.mockResolvedValue({
        emailVerificationRequired: true,
        verificationUrl: '/v1/auth/verify-email?token=tok-1',
      });

      render(<RegisterForm next={next} />);
      fillAndSubmit('rider@example.com', 'a-strong-password-123');

      expect(
        await screen.findByRole('link', { name: expected }),
      ).toHaveAttribute('href', expected);
      expect(registerAccountMock).toHaveBeenCalledWith({
        email: 'rider@example.com',
        password: 'a-strong-password-123',
        confirmPassword: 'a-strong-password-123',
        consents: currentLegalConsents(),
        ...(sentNext ? { next: sentNext } : {}),
      });
    },
  );
});

// CR-261: «Повторите пароль» is checked before sending. CR-262 (ADR-039): it is
// sent too, and the API checks it again.
describe('RegisterForm confirm password', () => {
  beforeEach(() => {
    registerAccountMock.mockReset();
  });

  it('shows «Пароли не совпадают.» at the field and sends nothing', async () => {
    render(<RegisterForm />);
    fillAndSubmit(
      'rider@example.com',
      'a-strong-password-123',
      'a-strong-password-124',
    );

    const confirm = screen.getByLabelText('Повторите пароль');
    await waitFor(() =>
      expect(confirm).toHaveAttribute('aria-invalid', 'true'),
    );
    const message = screen.getByText('Пароли не совпадают.');
    expect(confirm.getAttribute('aria-describedby')).toBe(message.id);
    expect(screen.getByLabelText('Пароль')).toHaveAttribute(
      'aria-invalid',
      'false',
    );
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it('asks to fill an empty confirm field', async () => {
    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'a-strong-password-123', '');
    expect(await screen.findByText('Заполните это поле.')).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  // CR-268: the submit-time error described the old values — editing either
  // field hands back to the live match line, before any second submit.
  it('drops the stale mismatch error as soon as a field is edited', async () => {
    render(<RegisterForm />);
    fillAndSubmit(
      'rider@example.com',
      'a-strong-password-123',
      'a-strong-password-124',
    );
    expect(await screen.findByText('Пароли не совпадают.')).toBeInTheDocument();

    const confirm = screen.getByLabelText('Повторите пароль');
    fireEvent.change(confirm, { target: { value: 'a-strong-password-123' } });

    expect(screen.queryByText('Пароли не совпадают.')).not.toBeInTheDocument();
    expect(confirm).toHaveAttribute('aria-invalid', 'false');
    expect(screen.getByText('Пароли совпадают')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: 'a-strong-password-12' },
    });
    expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it('clears the mismatch once the passwords match and sends both fields', async () => {
    registerAccountMock.mockResolvedValue({
      emailVerificationRequired: true,
    });
    render(<RegisterForm />);
    fillAndSubmit(
      'rider@example.com',
      'a-strong-password-123',
      'other-password-12',
    );
    expect(await screen.findByText('Пароли не совпадают.')).toBeInTheDocument();

    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    await screen.findByText('Проверьте почту');
    expect(registerAccountMock).toHaveBeenCalledTimes(1);
    const payload = registerAccountMock.mock.calls[0]![0];
    expect(payload).toEqual({
      email: 'rider@example.com',
      password: 'a-strong-password-123',
      confirmPassword: 'a-strong-password-123',
      consents: currentLegalConsents(),
    });
  });
});

// CR-261 (ADR-038): the reCAPTCHA tick on register.
describe('RegisterForm reCAPTCHA', () => {
  let fake: ReturnType<typeof installFakeGrecaptcha>;

  beforeEach(() => {
    registerAccountMock.mockReset();
    fake = installFakeGrecaptcha();
  });

  afterEach(() => {
    fake.uninstall();
  });

  async function renderWithCaptcha() {
    render(<RegisterForm captchaSiteKey="a-site-key" />);
    await waitFor(() => expect(fake.grecaptcha.render).toHaveBeenCalled());
  }

  it('renders the widget with the site key, in Russian-labelled group', async () => {
    await renderWithCaptcha();
    expect(fake.widgets[0]).toMatchObject({
      sitekey: 'a-site-key',
      theme: 'light',
    });
    expect(
      screen.getByRole('group', { name: 'Проверка «Я не робот»' }),
    ).toBeInTheDocument();
  });

  it('refuses to send before the tick and says so', async () => {
    await renderWithCaptcha();
    fillAndSubmit('rider@example.com', 'a-strong-password-123');
    expect(
      await screen.findByText('Отметьте «Я не робот».'),
    ).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });

  it('sends the token with the form once ticked', async () => {
    registerAccountMock.mockResolvedValue({
      emailVerificationRequired: true,
    });
    await renderWithCaptcha();
    fake.solve('token-1');
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    await screen.findByText('Проверьте почту');
    expect(registerAccountMock).toHaveBeenCalledWith({
      email: 'rider@example.com',
      password: 'a-strong-password-123',
      confirmPassword: 'a-strong-password-123',
      consents: currentLegalConsents(),
      captchaToken: 'token-1',
    });
  });

  it.each([
    [
      'captcha_invalid',
      400,
      'Проверка «Я не робот» не пройдена или устарела. Отметьте её ещё раз.',
    ],
    ['captcha_required', 400, 'Отметьте «Я не робот».'],
    [
      'captcha_unavailable',
      503,
      'Проверка «Я не робот» сейчас недоступна. Попробуйте ещё раз через минуту.',
    ],
  ])(
    'shows the API’s %s refusal at the widget and resets it',
    async (code, status, text) => {
      registerAccountMock.mockRejectedValue(englishProblem(code, { status }));
      await renderWithCaptcha();
      fake.solve('token-1');
      fillAndSubmit('rider@example.com', 'a-strong-password-123');

      expect(await screen.findByText(text)).toBeInTheDocument();
      expect(fake.grecaptcha.reset).toHaveBeenCalledWith(0);
      expectNoEnglishApiText();

      // The spent token is gone: the next submit asks for a new tick.
      registerAccountMock.mockClear();
      fillAndSubmit('rider@example.com', 'a-strong-password-123');
      expect(
        await screen.findByText('Отметьте «Я не робот».'),
      ).toBeInTheDocument();
      expect(registerAccountMock).not.toHaveBeenCalled();
    },
  );

  it('resets the tick after any other failure too (the token is spent)', async () => {
    registerAccountMock.mockRejectedValue(
      englishProblem('internal_error', { status: 500 }),
    );
    await renderWithCaptcha();
    fake.solve('token-1');
    fillAndSubmit('rider@example.com', 'a-strong-password-123');

    expect(
      await screen.findByText(
        'Не удалось выполнить запрос. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(fake.grecaptcha.reset).toHaveBeenCalledTimes(1);
  });

  it('says so when the tick expires before sending', async () => {
    await renderWithCaptcha();
    fake.solve('token-1');
    fake.expire();
    expect(
      screen.getByText('Проверка устарела — отметьте «Я не робот» ещё раз.'),
    ).toBeInTheDocument();
    fillAndSubmit('rider@example.com', 'a-strong-password-123');
    expect(
      await screen.findByText('Отметьте «Я не робот».'),
    ).toBeInTheDocument();
    expect(registerAccountMock).not.toHaveBeenCalled();
  });
});

// CR-262: the auth mockup's live password states.
describe('RegisterForm password states', () => {
  beforeEach(() => {
    registerAccountMock.mockReset();
  });

  function type(label: string, value: string) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }

  it('names the strength in words as the password grows', () => {
    render(<RegisterForm />);
    expect(screen.queryByText(/Надёжность пароля/)).not.toBeInTheDocument();

    type('Пароль', 'short');
    expect(
      screen.getByText('Надёжность пароля: слишком короткий'),
    ).toBeInTheDocument();
    type('Пароль', 'aaaaaaaaaaaa');
    expect(screen.getByText('Надёжность пароля: слабый')).toBeInTheDocument();
    type('Пароль', 'coffee-ride-2026');
    expect(screen.getByText('Надёжность пароля: надёжный')).toBeInTheDocument();
  });

  it('says whether the two passwords match while typing', () => {
    render(<RegisterForm />);
    type('Пароль', 'coffee-ride-2026');
    expect(
      screen.queryByText(/Пароли (не )?совпадают/),
    ).not.toBeInTheDocument();

    type('Повторите пароль', 'coffee-ride-20');
    expect(screen.getByText('Пароли не совпадают')).toBeInTheDocument();
    type('Повторите пароль', 'coffee-ride-2026');
    expect(screen.getByText('Пароли совпадают')).toBeInTheDocument();
  });

  it('shows and hides each password with its own toggle', () => {
    render(<RegisterForm />);
    const [first, second] = screen.getAllByRole('button', {
      name: 'Показать пароль',
    });
    fireEvent.click(first!);
    expect(screen.getByLabelText('Пароль')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Повторите пароль')).toHaveAttribute(
      'type',
      'password',
    );
    fireEvent.click(second!);
    expect(screen.getByLabelText('Повторите пароль')).toHaveAttribute(
      'type',
      'text',
    );
  });

  it('refuses a weak-but-long-enough password nowhere — the meter only advises', async () => {
    registerAccountMock.mockResolvedValue({ emailVerificationRequired: true });
    render(<RegisterForm />);
    fillAndSubmit('rider@example.com', 'aaaaaaaaaaaa');
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(registerAccountMock).toHaveBeenCalledOnce();
  });
});
