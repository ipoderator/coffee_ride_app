import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { GOOGLE_SIGN_IN_TERMS, YANDEX_SIGN_IN_TERMS } from 'ui';
import type { OAuthOutcome } from '@/features/auth/oauth/api';
import { OAuthOutcomeAlert } from '@/features/auth/oauth/components/OAuthOutcomeAlert';
import { OAuthSignIn } from '@/features/auth/oauth/components/OAuthSignIn';

// CR-247 (ADR-034), CR-260 (ADR-037): the external sign-in buttons for the providers
// the server has configured (the page decides; with none it renders nothing).
// CR-264: the same two-column block on `/login` and `/register`, Google first; the
// pages own the divider and the consent line (`LoginScreen`/`RegisterScreen`).

const NEXT = '/rides/ride-1';

const meta = {
  title: 'Auth/OAuthSignIn',
  component: OAuthSignIn,
  tags: ['autodocs'],
  args: { next: NEXT, providers: { google: true, yandex: true } },
  render: (args) => (
    <div className="max-w-122">
      <OAuthSignIn {...args} />
    </div>
  ),
} satisfies Meta<typeof OAuthSignIn>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both providers configured: each button keeps `next`. */
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
  },
};

export const BothProvidersDark: Story = {
  ...BothProviders,
  globals: { theme: 'dark' },
};

/** `/register`'s wording: «Продолжить с …». */
export const RegisterIntent: Story = {
  args: { intent: 'register' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('link', { name: GOOGLE_SIGN_IN_TERMS.continueButton }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('link', { name: YANDEX_SIGN_IN_TERMS.continueButton }),
    ).toBeInTheDocument();
  },
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
