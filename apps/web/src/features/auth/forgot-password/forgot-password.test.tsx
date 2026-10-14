import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordForm } from './components/ForgotPasswordForm';
import { requestPasswordReset } from './api';
import { installFakeGrecaptcha } from '../captcha/fake-grecaptcha';
import {
  englishProblem,
  expectNoEnglishApiText,
} from '@/test-support/english-problem';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, requestPasswordReset: vi.fn() };
});

const requestPasswordResetMock = vi.mocked(requestPasswordReset);

function fillAndSubmit(email: string) {
  fireEvent.change(screen.getByLabelText('Email'), {
    target: { value: email },
  });
  fireEvent.click(
    screen.getByRole('button', {
      name: /Отправить ссылку для сброса|Отправка…/,
    }),
  );
}

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    requestPasswordResetMock.mockReset();
  });

  it('shows the same success state whether or not the account exists', async () => {
    requestPasswordResetMock.mockResolvedValue(undefined);

    render(<ForgotPasswordForm />);
    fillAndSubmit('rider@example.com');

    expect(await screen.findByText('Проверьте почту')).toBeInTheDocument();
    expect(requestPasswordResetMock).toHaveBeenCalledWith({
      email: 'rider@example.com',
    });
  });

  it('shows client-side validation without calling the API for an invalid email', async () => {
    render(<ForgotPasswordForm />);
    fillAndSubmit('not-an-email');

    await waitFor(() =>
      expect(screen.getByLabelText('Email')).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    );
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  // CR-194: Russian lines, never the schema's English.
  it('words an empty or invalid email in Russian', async () => {
    render(<ForgotPasswordForm />);

    fillAndSubmit('');
    expect(
      await screen.findByText('Введите email, например name@example.ru.'),
    ).toBeInTheDocument();

    fillAndSubmit('not-an-email');
    expect(
      await screen.findByText('Введите email, например name@example.ru.'),
    ).toBeInTheDocument();
    expectNoEnglishApiText();
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it('shows Russian for a server field error and keeps the API’s English off the screen', async () => {
    requestPasswordResetMock.mockRejectedValue(
      englishProblem('validation_error', { status: 400, fields: ['email'] }),
    );

    render(<ForgotPasswordForm />);
    fillAndSubmit('rider@example.com');

    expect(await screen.findByText('Проверьте это поле.')).toBeInTheDocument();
    expectNoEnglishApiText();
  });

  it('shows the generic Russian line for a code it does not know', async () => {
    requestPasswordResetMock.mockRejectedValue(
      englishProblem('rate_limited', { status: 429 }),
    );

    render(<ForgotPasswordForm />);
    fillAndSubmit('rider@example.com');

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('alert').textContent).toMatch(/[А-Яа-я]/);
    expectNoEnglishApiText();
  });

  it('ignores a second submit while pending (duplicate-submit protection)', async () => {
    requestPasswordResetMock.mockReturnValue(new Promise(() => {}));

    render(<ForgotPasswordForm />);
    fillAndSubmit('rider@example.com');
    await screen.findByRole('button', { name: 'Отправка…' });

    fireEvent.submit(
      screen.getByRole('button', { name: 'Отправка…' }).closest('form')!,
    );

    expect(requestPasswordResetMock).toHaveBeenCalledOnce();
  });
});

// CR-261 (ADR-038): the reCAPTCHA tick before a reset email can be requested.
describe('ForgotPasswordForm reCAPTCHA', () => {
  let fake: ReturnType<typeof installFakeGrecaptcha>;

  beforeEach(() => {
    requestPasswordResetMock.mockReset();
    fake = installFakeGrecaptcha();
  });

  afterEach(() => {
    fake.uninstall();
  });

  async function renderWithCaptcha() {
    render(<ForgotPasswordForm captchaSiteKey="a-site-key" />);
    await waitFor(() => expect(fake.grecaptcha.render).toHaveBeenCalled());
  }

  it('refuses to send before the tick', async () => {
    await renderWithCaptcha();
    fillAndSubmit('rider@example.com');
    expect(
      await screen.findByText('Отметьте «Я не робот».'),
    ).toBeInTheDocument();
    expect(requestPasswordResetMock).not.toHaveBeenCalled();
  });

  it('sends the token and shows the same success state', async () => {
    requestPasswordResetMock.mockResolvedValue(undefined);
    await renderWithCaptcha();
    fake.solve('token-1');
    fillAndSubmit('rider@example.com');

    expect(await screen.findByText('Проверьте почту')).toBeInTheDocument();
    expect(requestPasswordResetMock).toHaveBeenCalledWith({
      email: 'rider@example.com',
      captchaToken: 'token-1',
    });
  });

  it('shows an unavailable Google at the widget and resets it', async () => {
    requestPasswordResetMock.mockRejectedValue(
      englishProblem('captcha_unavailable', { status: 503 }),
    );
    await renderWithCaptcha();
    fake.solve('token-1');
    fillAndSubmit('rider@example.com');

    expect(
      await screen.findByText(
        'Проверка «Я не робот» сейчас недоступна. Попробуйте ещё раз через минуту.',
      ),
    ).toBeInTheDocument();
    expect(fake.grecaptcha.reset).toHaveBeenCalledTimes(1);
    expectNoEnglishApiText();
  });
});
