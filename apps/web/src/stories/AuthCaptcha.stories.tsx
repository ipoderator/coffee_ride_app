import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, waitFor } from 'storybook/test';
import { AUTH_TERMS, CAPTCHA_TERMS, FORGOT_PASSWORD_TERMS } from 'ui';
import { RecaptchaField } from '@/features/auth/captcha/components/RecaptchaField';
import {
  resetRecaptchaLoaderForTests,
  type RecaptchaRenderOptions,
} from '@/features/auth/captcha/load-recaptcha';
import { ForgotPasswordForm } from '@/features/auth/forgot-password/components/ForgotPasswordForm';
import { LoginForm } from '@/features/auth/login/components/LoginForm';
import { RegisterForm } from '@/features/auth/register/components/RegisterForm';
import { SessionProvider } from '@/lib/auth/session-context';

// CR-261 (ADR-038): the auth forms with «Повторите пароль» and the reCAPTCHA v2
// tick. Google's widget is a cross-origin frame the stories can't drive, so
// `grecaptcha` is stubbed with a same-size stand-in: a checkbox labelled «Я не
// робот» whose tick plays the widget's callback. The API is stubbed per story.

const SITE_KEY = 'storybook-site-key';

/** A stand-in for Google's checkbox; its tick issues `story-token`. */
function stubGrecaptcha() {
  resetRecaptchaLoaderForTests();
  window.grecaptcha = {
    render(container: HTMLElement, options: RecaptchaRenderOptions) {
      const label = document.createElement('label');
      label.className =
        'flex h-[78px] w-[304px] max-w-full items-center gap-3 rounded-sm border border-border bg-surface px-3 text-body-sm text-text';
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.className = 'size-6';
      box.addEventListener('change', () => {
        if (box.checked) options.callback('story-token');
        else options['expired-callback']();
      });
      label.append(box, 'Я не робот');
      container.append(label);
      return 0;
    },
    reset() {
      document
        .querySelectorAll<HTMLInputElement>('label input[type="checkbox"]')
        .forEach((box) => (box.checked = false));
    },
  };
  return () => {
    delete window.grecaptcha;
    resetRecaptchaLoaderForTests();
  };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function problem(status: number, code: string) {
  return json(
    {
      type: `https://coffee-ride.example/errors/${code}`,
      title: 'Request failed',
      status,
      detail: 'English detail that must never show.',
      instance: '/v1/test',
      code,
    },
    status,
  );
}

/** Stubs `grecaptcha` and `fetch` for one story. */
function stub(answer: (url: URL) => Response | undefined) {
  return () => {
    const undoCaptcha = stubGrecaptcha();
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);
      if (url.pathname === '/api/v1/auth/me')
        return problem(401, 'unauthorized');
      return answer(url) ?? original(input, init);
    };
    return () => {
      globalThis.fetch = original;
      undoCaptcha();
    };
  };
}

const meta = {
  title: 'Auth/CAPTCHA and confirm password',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <SessionProvider>
        <div className="mx-auto max-w-md">
          <Story />
        </div>
      </SessionProvider>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegisterWithCaptcha: Story = {
  beforeEach: stub(() => undefined),
  render: () => <RegisterForm captchaSiteKey={SITE_KEY} />,
  play: async ({ canvas }) => {
    await expect(
      canvas.getByLabelText(AUTH_TERMS.confirmPasswordLabel),
    ).toBeInTheDocument();
    await expect(
      await canvas.findByRole('group', { name: CAPTCHA_TERMS.label }),
    ).toBeInTheDocument();
  },
};

/** Mismatched passwords and no tick: both said at their fields, nothing sent. */
export const RegisterMismatchAndNoTick: Story = {
  beforeEach: stub(() => undefined),
  render: () => <RegisterForm captchaSiteKey={SITE_KEY} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText('Email'), 'rider@example.ru');
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'a-strong-password-123',
    );
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.confirmPasswordLabel),
      'a-strong-password-124',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.registerSubmit }),
    );
    await expect(
      await canvas.findByText(AUTH_TERMS.passwordsMismatch),
    ).toBeInTheDocument();
    await expect(
      canvas.getByLabelText(AUTH_TERMS.confirmPasswordLabel),
    ).toHaveAttribute('aria-invalid', 'true');
    await expect(canvas.getByText(CAPTCHA_TERMS.required)).toBeInTheDocument();
  },
};

export const RegisterMismatchAndNoTickDark: Story = {
  ...RegisterMismatchAndNoTick,
  globals: { theme: 'dark' },
};

/** Ticked, sent, Google unreachable from the API: the field says so, tick reset. */
export const RegisterCaptchaUnavailable: Story = {
  beforeEach: stub((url) =>
    url.pathname === '/api/v1/auth/register'
      ? problem(503, 'captcha_unavailable')
      : undefined,
  ),
  render: () => <RegisterForm captchaSiteKey={SITE_KEY} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText('Email'), 'rider@example.ru');
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'a-strong-password-123',
    );
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.confirmPasswordLabel),
      'a-strong-password-123',
    );
    await userEvent.click(await canvas.findByLabelText('Я не робот'));
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.registerSubmit }),
    );
    await expect(
      await canvas.findByText(CAPTCHA_TERMS.apiError.captcha_unavailable),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByLabelText('Я не робот')).not.toBeChecked(),
    );
  },
};

/** A wrong password after a passed tick keeps the one generic message. */
export const LoginWithCaptchaWrongPassword: Story = {
  // `LoginForm` navigates with the App Router's `useRouter`.
  parameters: { nextjs: { appDirectory: true } },
  beforeEach: stub((url) =>
    url.pathname === '/api/v1/auth/login'
      ? problem(401, 'invalid_credentials')
      : undefined,
  ),
  render: () => <LoginForm captchaSiteKey={SITE_KEY} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText('Email'), 'rider@example.ru');
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'not-the-password',
    );
    await userEvent.click(await canvas.findByLabelText('Я не робот'));
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.loginSubmit }),
    );
    await expect(
      await canvas.findByText(AUTH_TERMS.invalidCredentials),
    ).toBeInTheDocument();
  },
};

export const LoginWithCaptchaWrongPasswordDark: Story = {
  ...LoginWithCaptchaWrongPassword,
  globals: { theme: 'dark' },
};

export const ForgotPasswordCaptchaRejected: Story = {
  beforeEach: stub((url) =>
    url.pathname === '/api/v1/auth/forgot-password'
      ? problem(400, 'captcha_invalid')
      : undefined,
  ),
  render: () => <ForgotPasswordForm captchaSiteKey={SITE_KEY} />,
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText(FORGOT_PASSWORD_TERMS.emailLabel),
      'rider@example.ru',
    );
    await userEvent.click(await canvas.findByLabelText('Я не робот'));
    await userEvent.click(
      canvas.getByRole('button', { name: FORGOT_PASSWORD_TERMS.submit }),
    );
    await expect(
      await canvas.findByText(CAPTCHA_TERMS.apiError.captcha_invalid),
    ).toBeInTheDocument();
  },
};

/** Google's script can't load (blocked network): the field says what to do. */
export const WidgetLoadFailed: Story = {
  beforeEach: () => {
    resetRecaptchaLoaderForTests();
    window.grecaptcha = {
      render(_container, options) {
        queueMicrotask(() => options['error-callback']());
        return 0;
      },
      reset() {},
    };
    return () => {
      delete window.grecaptcha;
      resetRecaptchaLoaderForTests();
    };
  },
  render: () => (
    <RecaptchaField
      id="story-captcha"
      siteKey={SITE_KEY}
      onTokenChange={() => {}}
    />
  ),
  play: async ({ canvas }) => {
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      CAPTCHA_TERMS.loadFailed,
    );
  },
};

export const WidgetLoadFailedDark: Story = {
  ...WidgetLoadFailed,
  globals: { theme: 'dark' },
};
