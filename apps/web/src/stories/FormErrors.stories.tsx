import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { AUTH_TERMS, REVIEWS_TERMS, VALIDATION_TERMS } from 'ui';
import { ForgotPasswordForm } from '@/features/auth/forgot-password/components/ForgotPasswordForm';
import { LoginForm } from '@/features/auth/login/components/LoginForm';
import { RegisterForm } from '@/features/auth/register/components/RegisterForm';
import { ResetPasswordForm } from '@/features/auth/reset-password/components/ResetPasswordForm';
import { OrganizerProfileForm } from '@/features/organizer/profile/components/OrganizerProfileForm';
import { ReviewForm } from '@/features/participant/ride-detail/components/ReviewForm';
import { SessionProvider } from '@/lib/auth/session-context';

// CR-194 (QA 13653ed): a field that fails validation reads in Russian. These
// stories drive the real forms into each failure — empty, wrong shape, a field
// the server rejects, a code nobody mapped — and check what is on screen. The
// stubbed API answers the way the real one does: `application/problem+json`
// with English `detail` and `errors[].message`. None of that may show.

const ENGLISH = {
  detail: 'The request payload is invalid.',
  field: 'Invalid email address',
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/problem+json' },
  });
}

function problem(status: number, code: string, fields: string[] = []) {
  return json(
    {
      type: `https://coffee-ride.example/errors/${code}`,
      title: 'Request failed',
      status,
      detail: ENGLISH.detail,
      instance: '/v1/test',
      code,
      ...(fields.length > 0
        ? {
            errors: fields.map((path) => ({
              path,
              message: ENGLISH.field,
            })),
          }
        : {}),
    },
    status,
  );
}

type Handler = (url: URL, init?: RequestInit) => Response | undefined;

/** Stubs `fetch` for the story; anything the handler skips goes through. */
function stubApi(handler: Handler) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);
      return handler(url, init) ?? original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

const signedOut: Handler = (url) =>
  url.pathname === '/api/v1/auth/me' ? problem(401, 'unauthorized') : undefined;

const meta = {
  title: 'Forms/Validation errors',
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** The page text must never carry what the API wrote in English. */
async function expectNoEnglish(canvasElement: HTMLElement) {
  const text = canvasElement.textContent ?? '';
  await expect(text).not.toContain(ENGLISH.detail);
  await expect(text).not.toContain(ENGLISH.field);
  await expect(text).not.toContain('Password must be');
  await expect(text).not.toContain('cannot be empty');
}

/** QA case: an untouched «Регистрация» submitted. */
export const RegisterEmpty: Story = {
  render: () => <RegisterForm />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.registerSubmit }),
    );

    await expect(
      await canvas.findByText(VALIDATION_TERMS.email),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(VALIDATION_TERMS.tooShort(12)),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText(AUTH_TERMS.emailLabel)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expectNoEnglish(canvasElement);
  },
};

export const RegisterEmptyDark: Story = {
  ...RegisterEmpty,
  globals: { theme: 'dark' },
};

/** QA case: a malformed email and a password under 12 characters. */
export const RegisterInvalid: Story = {
  render: () => <RegisterForm />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(canvas.getByLabelText(AUTH_TERMS.emailLabel), 'abc');
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'short',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.registerSubmit }),
    );

    await expect(
      await canvas.findByText(VALIDATION_TERMS.email),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(VALIDATION_TERMS.tooShort(12)),
    ).toBeInTheDocument();
    await expectNoEnglish(canvasElement);
  },
};

/** The client passed it, the server did not: the field says so in Russian. */
export const RegisterServerRejectsFields: Story = {
  beforeEach: stubApi((url, init) =>
    url.pathname === '/api/v1/auth/register' && init?.method === 'POST'
      ? problem(400, 'validation_error', ['email', 'password'])
      : undefined,
  ),
  render: () => <RegisterForm />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.emailLabel),
      'rider@example.com',
    );
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'a-strong-password-123',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.registerSubmit }),
    );

    await expect(
      await canvas.findAllByText(VALIDATION_TERMS.invalid),
    ).toHaveLength(2);
    await expectNoEnglish(canvasElement);
  },
};

/** A code the app has no wording for: the generic Russian line, not `detail`. */
export const RegisterUnknownServerCode: Story = {
  beforeEach: stubApi((url, init) =>
    url.pathname === '/api/v1/auth/register' && init?.method === 'POST'
      ? problem(418, 'some_new_server_code')
      : undefined,
  ),
  render: () => <RegisterForm />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.emailLabel),
      'rider@example.com',
    );
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'a-strong-password-123',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.registerSubmit }),
    );

    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      AUTH_TERMS.genericError,
    );
    await expectNoEnglish(canvasElement);
  },
};

export const LoginEmpty: Story = {
  // `LoginForm` navigates with the App Router's `useRouter`.
  parameters: { nextjs: { appDirectory: true } },
  beforeEach: stubApi(signedOut),
  render: () => (
    <SessionProvider>
      <LoginForm />
    </SessionProvider>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.loginSubmit }),
    );

    await expect(
      await canvas.findByText(VALIDATION_TERMS.email),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(VALIDATION_TERMS.required),
    ).toBeInTheDocument();
    await expectNoEnglish(canvasElement);
  },
};

/** CR-231 (ADR-032): a blocked account learns it only after a correct password. */
export const LoginAccountBlocked: Story = {
  parameters: { nextjs: { appDirectory: true } },
  beforeEach: stubApi(
    (url, init) =>
      signedOut(url, init) ??
      (url.pathname === '/api/v1/auth/login'
        ? problem(403, 'account_blocked')
        : undefined),
  ),
  render: () => (
    <SessionProvider>
      <LoginForm />
    </SessionProvider>
  ),
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.emailLabel),
      'rider@example.com',
    );
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'a-strong-password-123',
    );
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.loginSubmit }),
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      AUTH_TERMS.accountBlocked,
    );
    await expectNoEnglish(canvasElement);
  },
};

export const ForgotPasswordInvalidEmail: Story = {
  render: () => <ForgotPasswordForm />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.emailLabel),
      'не-почта',
    );
    await userEvent.click(canvas.getByRole('button'));

    await expect(
      await canvas.findByText(VALIDATION_TERMS.email),
    ).toBeInTheDocument();
    await expectNoEnglish(canvasElement);
  },
};

export const ResetPasswordTooShort: Story = {
  render: () => <ResetPasswordForm token="story-token" />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.type(canvas.getByLabelText(/пароль/i), 'short');
    await userEvent.click(canvas.getByRole('button'));

    await expect(
      await canvas.findByText(VALIDATION_TERMS.tooShort(12)),
    ).toBeInTheDocument();
    await expectNoEnglish(canvasElement);
  },
};

/** QA case: «Профиль организатора» saved with an empty name. */
export const OrganizerProfileEmptyName: Story = {
  beforeEach: stubApi((url, init) =>
    url.pathname === '/api/v1/organizers/me' && !init?.method
      ? problem(404, 'organizer_profile_not_found')
      : undefined,
  ),
  render: () => <OrganizerProfileForm />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      await canvas.findByRole('button', { name: 'Создать профиль' }),
    );

    await expect(
      await canvas.findByText(VALIDATION_TERMS.required),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText('Название')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expectNoEnglish(canvasElement);
  },
};

export const OrganizerProfileEmptyNameDark: Story = {
  ...OrganizerProfileEmptyName,
  globals: { theme: 'dark' },
};

/** A comment past 2 000 characters used to fail without a word on screen. */
export const ReviewCommentTooLong: Story = {
  render: () => <ReviewForm rideId="story-ride" onSubmitted={() => {}} />,
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(canvas.getByRole('radio', { name: '5 из 5' }));
    // `paste`, not `type`: 2 001 keystrokes make a slow story.
    await userEvent.click(canvas.getByLabelText(REVIEWS_TERMS.commentLabel));
    await userEvent.paste('x'.repeat(2001));
    await userEvent.click(
      canvas.getByRole('button', { name: REVIEWS_TERMS.submit }),
    );

    await expect(
      await canvas.findByText(/^Не длиннее 2\s000 символов\.$/),
    ).toBeInTheDocument();
    await expect(
      canvas.getByLabelText(REVIEWS_TERMS.commentLabel),
    ).toHaveAttribute('aria-invalid', 'true');
    await expectNoEnglish(canvasElement);
  },
};
