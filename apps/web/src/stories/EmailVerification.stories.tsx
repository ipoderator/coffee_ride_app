import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { AUTH_TERMS, VERIFY_EMAIL_TERMS } from 'ui';
import { RegisterForm } from '@/features/auth/register/components/RegisterForm';
import { VerifyEmailStatus } from '@/features/auth/verify-email/components/VerifyEmailStatus';
import { SessionProvider } from '@/lib/auth/session-context';

// CR-197 (QA `fe0b4c2`): a visitor who registers from a ride goes register →
// verify email → «Перейти ко входу» → sign in, and must land back on the ride.
// Registering doesn't sign in, so the return target (`next`) rides along on
// every link of that chain. Stories stub `fetch` (the `RideFilters`
// precedent) and render the real components.

const NEXT = '/rides/ride-1';
const ENCODED_NEXT = encodeURIComponent(NEXT);

const USER = {
  id: '00000000-0000-0000-0000-000000000001',
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function problem(status: number, code: string) {
  return json(
    {
      type: `https://coffee-ride.example/errors/${code}`,
      title: 'Error',
      status,
      detail: 'Request failed.',
      instance: '/v1/auth',
      code,
    },
    status,
  );
}

function stub(verify: 'ok' | 'expired', { registerVerified = false } = {}) {
  return () => {
    const original = globalThis.fetch;

    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);

      if (url.pathname === '/api/v1/auth/me') {
        return problem(401, 'unauthorized');
      }
      if (url.pathname === '/api/v1/auth/register') {
        // CR-220: AUTH_SKIP_EMAIL_VERIFICATION — verified, no link.
        return json(
          registerVerified
            ? { user: USER }
            : {
                user: { ...USER, emailVerified: false },
                verificationUrl: '/v1/auth/verify-email?token=tok-1',
              },
          201,
        );
      }
      if (url.pathname === '/api/v1/auth/verify-email') {
        return verify === 'ok'
          ? json({ user: USER })
          : problem(400, 'verification_token_expired');
      }

      return original(input, init);
    };

    return () => {
      globalThis.fetch = original;
    };
  };
}

const meta = {
  title: 'Auth/EmailVerification',
  component: VerifyEmailStatus,
  tags: ['autodocs'],
  args: { token: 'tok-1', next: NEXT },
  render: (args) => (
    <SessionProvider>
      <VerifyEmailStatus {...args} />
    </SessionProvider>
  ),
} satisfies Meta<typeof VerifyEmailStatus>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The account is created; the dev verification link keeps the ride. */
export const RegisterSucceeded: Story = {
  beforeEach: stub('ok'),
  render: () => <RegisterForm next={NEXT} />,
  play: async ({ canvas, userEvent }) => {
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

    const href = `/verify-email?token=tok-1&next=${ENCODED_NEXT}`;
    await expect(
      await canvas.findByRole('link', { name: href }),
    ).toHaveAttribute('href', href);
    await expect(
      canvas.getByRole('link', { name: AUTH_TERMS.registerSuccessLoginLink }),
    ).toHaveAttribute('href', `/login?next=${ENCODED_NEXT}`);
  },
};

export const RegisterSucceededDark: Story = {
  ...RegisterSucceeded,
  globals: { theme: 'dark' },
};

/** Test deploy (CR-220): the account is already verified — no inbox step. */
export const RegisterSucceededVerified: Story = {
  beforeEach: stub('ok', { registerVerified: true }),
  render: () => <RegisterForm next={NEXT} />,
  play: async ({ canvas, userEvent }) => {
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
      await canvas.findByText(AUTH_TERMS.registerSuccessBodyVerified),
    ).toBeVisible();
    await expect(
      canvas.queryByText(AUTH_TERMS.registerSuccessDevNote, { exact: false }),
    ).toBeNull();
  },
};

export const RegisterSucceededVerifiedDark: Story = {
  ...RegisterSucceededVerified,
  globals: { theme: 'dark' },
};

/** Email verified; «Перейти ко входу» returns to the ride after sign-in. */
export const Verified: Story = {
  beforeEach: stub('ok'),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', { name: VERIFY_EMAIL_TERMS.loginLink }),
    ).toHaveAttribute('href', `/login?next=${ENCODED_NEXT}`);
  },
};

export const VerifiedDark: Story = {
  ...Verified,
  globals: { theme: 'dark' },
};

/** No return target: the plain sign-in link, as before. */
export const VerifiedWithoutNext: Story = {
  beforeEach: stub('ok'),
  args: { next: null },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', { name: VERIFY_EMAIL_TERMS.loginLink }),
    ).toHaveAttribute('href', '/login');
  },
};

/** An expired link: the error state with the resend button. */
export const Expired: Story = {
  beforeEach: stub('expired'),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(VERIFY_EMAIL_TERMS.invalidOrExpired),
    ).toBeInTheDocument();
  },
};
