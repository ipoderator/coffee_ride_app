import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { GOOGLE_SIGN_IN_TERMS } from 'ui';
import { GoogleOutcomeAlert } from '@/features/auth/google/components/GoogleOutcomeAlert';
import { GoogleSignIn } from '@/features/auth/google/components/GoogleSignIn';
import { LoginForm } from '@/features/auth/login/components/LoginForm';
import { SessionProvider } from '@/lib/auth/session-context';

// CR-247 (ADR-034): «Войти через Google» under the login form, as `/login` renders
// it when the server has `GOOGLE_*` (the page decides; without them it renders the
// form alone).

const NEXT = '/rides/ride-1';

// `LoginForm` asks `/api/v1/auth/me` for the session.
function stubSignedOut() {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.href);
    if (url.pathname === '/api/v1/auth/me') {
      return Response.json({ code: 'unauthorized' }, { status: 401 });
    }
    return original(input, init);
  };
  return () => {
    globalThis.fetch = original;
  };
}

const meta = {
  title: 'Auth/GoogleSignIn',
  component: GoogleSignIn,
  tags: ['autodocs'],
  args: { next: NEXT },
  beforeEach: stubSignedOut,
  // `LoginForm` uses the App Router.
  parameters: { nextjs: { appDirectory: true } },
  render: (args) => (
    <SessionProvider>
      <div className="flex max-w-md flex-col gap-6">
        <LoginForm next={args.next} />
        <GoogleSignIn {...args} />
      </div>
    </SessionProvider>
  ),
} satisfies Meta<typeof GoogleSignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Google configured: the button keeps `next`; the consent line links both documents. */
export const Available: Story = {
  play: async ({ canvas }) => {
    const link = await canvas.findByRole('link', {
      name: GOOGLE_SIGN_IN_TERMS.button,
    });
    await expect(link).toHaveAttribute(
      'href',
      `/api/v1/auth/google?next=${encodeURIComponent(NEXT)}`,
    );
    await expect(
      canvas.getByRole('link', { name: GOOGLE_SIGN_IN_TERMS.consentPrivacy }),
    ).toHaveAttribute('href', '/privacy');
  },
};

export const AvailableDark: Story = {
  ...Available,
  globals: { theme: 'dark' },
};

/** `/login?oauth=<outcome>`: why the Google sign-in came back without a session. */
export const Outcomes: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      {(
        Object.keys(GOOGLE_SIGN_IN_TERMS.outcome) as Array<
          keyof typeof GOOGLE_SIGN_IN_TERMS.outcome
        >
      ).map((outcome) => (
        <GoogleOutcomeAlert key={outcome} outcome={outcome} />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('alert')).toHaveLength(
      Object.keys(GOOGLE_SIGN_IN_TERMS.outcome).length,
    );
  },
};

export const OutcomesDark: Story = {
  ...Outcomes,
  globals: { theme: 'dark' },
};
