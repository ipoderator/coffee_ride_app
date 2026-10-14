import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import {
  GOOGLE_SIGN_IN_TERMS,
  OAUTH_SIGN_IN_TERMS,
  YANDEX_SIGN_IN_TERMS,
} from 'ui';
import type { OAuthOutcome } from '@/features/auth/oauth/api';
import { OAuthOutcomeAlert } from '@/features/auth/oauth/components/OAuthOutcomeAlert';
import { OAuthSignIn } from '@/features/auth/oauth/components/OAuthSignIn';
import { LoginForm } from '@/features/auth/login/components/LoginForm';
import { SessionProvider } from '@/lib/auth/session-context';

// CR-247 (ADR-034), CR-260 (ADR-037): «Войти через Яндекс» / «Войти через Google»
// under the login form, as `/login` renders them for the providers the server has
// configured (the page decides; with none it renders the form alone).

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
  title: 'Auth/OAuthSignIn',
  component: OAuthSignIn,
  tags: ['autodocs'],
  args: { next: NEXT, providers: { google: true, yandex: true } },
  beforeEach: stubSignedOut,
  // `LoginForm` uses the App Router.
  parameters: { nextjs: { appDirectory: true } },
  render: (args) => (
    <SessionProvider>
      <div className="flex max-w-md flex-col gap-6">
        <LoginForm next={args.next} />
        <OAuthSignIn {...args} />
      </div>
    </SessionProvider>
  ),
} satisfies Meta<typeof OAuthSignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both providers configured: each button keeps `next`; one consent line for both. */
export const BothProviders: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', { name: YANDEX_SIGN_IN_TERMS.button }),
    ).toHaveAttribute(
      'href',
      `/api/v1/auth/yandex?next=${encodeURIComponent(NEXT)}`,
    );
    await expect(
      canvas.getByRole('link', { name: GOOGLE_SIGN_IN_TERMS.button }),
    ).toHaveAttribute(
      'href',
      `/api/v1/auth/google?next=${encodeURIComponent(NEXT)}`,
    );
    await expect(
      canvas.getAllByRole('link', { name: OAUTH_SIGN_IN_TERMS.consentPrivacy }),
    ).toHaveLength(1);
  },
};

export const BothProvidersDark: Story = {
  ...BothProviders,
  globals: { theme: 'dark' },
};

/** Only Yandex ID configured. */
export const YandexOnly: Story = {
  args: { providers: { google: false, yandex: true } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', { name: YANDEX_SIGN_IN_TERMS.button }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('link', { name: GOOGLE_SIGN_IN_TERMS.button }),
    ).toBeNull();
  },
};

/** Only Google configured (the CR-247 state). */
export const GoogleOnly: Story = {
  args: { providers: { google: true, yandex: false } },
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', { name: GOOGLE_SIGN_IN_TERMS.button }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole('link', { name: YANDEX_SIGN_IN_TERMS.button }),
    ).toBeNull();
  },
};

const OUTCOMES: OAuthOutcome[] = [
  ...(
    Object.keys(YANDEX_SIGN_IN_TERMS.outcome) as Array<
      keyof typeof YANDEX_SIGN_IN_TERMS.outcome
    >
  ).map((outcome) => ({ provider: 'yandex' as const, outcome })),
  ...(
    Object.keys(GOOGLE_SIGN_IN_TERMS.outcome) as Array<
      keyof typeof GOOGLE_SIGN_IN_TERMS.outcome
    >
  ).map((outcome) => ({ provider: 'google' as const, outcome })),
];

/** `/login?oauth=<outcome>[&provider=yandex]`: why a sign-in came back without a session. */
export const Outcomes: Story = {
  render: () => (
    <div className="flex max-w-md flex-col gap-3">
      {OUTCOMES.map((result) => (
        <OAuthOutcomeAlert
          key={`${result.provider}-${result.outcome}`}
          result={result}
        />
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('alert')).toHaveLength(OUTCOMES.length);
  },
};

export const OutcomesDark: Story = {
  ...Outcomes,
  globals: { theme: 'dark' },
};
