import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import {
  AUTH_TERMS,
  GOOGLE_SIGN_IN_TERMS,
  LOGIN_PAGE_TERMS,
  PASSWORD_TERMS,
  YANDEX_SIGN_IN_TERMS,
} from 'ui';
import { LoginScreen } from '@/features/auth/login/components/LoginScreen';
import { SessionProvider } from '@/lib/auth/session-context';

// CR-264: `/login` laid out like the auth mockup's «Вход» tab
// (`reference/coffee-ride-auth-mockup`) — the page's own `LoginScreen`, with the
// providers and outcome the page would read from the API and the URL.

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
  title: 'Auth/LoginScreen',
  component: LoginScreen,
  tags: ['autodocs'],
  args: { next: NEXT, providers: { google: true, yandex: true } },
  beforeEach: stubSignedOut,
  // `LoginForm` uses the App Router.
  parameters: { nextjs: { appDirectory: true }, layout: 'fullscreen' },
  render: (args) => (
    <SessionProvider>
      <LoginScreen {...args} />
    </SessionProvider>
  ),
} satisfies Meta<typeof LoginScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both providers, equal and first; Google then Yandex ID, each keeping `next`. */
export const Default: Story = {
  globals: { theme: 'both' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByRole('link', { name: GOOGLE_SIGN_IN_TERMS.button })[0],
    ).toHaveAttribute(
      'href',
      `/api/v1/auth/google?next=${encodeURIComponent(NEXT)}`,
    );
    await expect(
      canvas.getAllByRole('link', { name: YANDEX_SIGN_IN_TERMS.button })[0],
    ).toHaveAttribute(
      'href',
      `/api/v1/auth/yandex?next=${encodeURIComponent(NEXT)}`,
    );
    await expect(
      canvas.getAllByRole('link', { name: LOGIN_PAGE_TERMS.switchLink })[0],
    ).toHaveAttribute('href', `/register?next=${encodeURIComponent(NEXT)}`);
  },
};

/** The show/hide toggle on «Пароль»; «Забыли пароль?» on its label line. */
export const PasswordRevealed: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas, userEvent }) => {
    const password = canvas.getByLabelText(AUTH_TERMS.passwordLabel);
    await userEvent.type(password, 'coffee-ride-2026');
    await userEvent.click(
      canvas.getByRole('button', { name: PASSWORD_TERMS.show }),
    );
    await expect(password).toHaveAttribute('type', 'text');
    await expect(
      canvas.getByRole('link', { name: AUTH_TERMS.forgotPasswordLink }),
    ).toHaveAttribute('href', '/forgot-password');
  },
};

/** An empty submit: both fields say what is missing. */
export const EmptySubmit: Story = {
  globals: { theme: 'light' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.loginSubmit }),
    );
    await expect(canvas.getByLabelText(AUTH_TERMS.emailLabel)).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
    ).toHaveAttribute('aria-invalid', 'true');
  },
};

/** Back from Yandex with a forged `state`: the reason above the buttons. */
export const ProviderRefused: Story = {
  globals: { theme: 'dark' },
  args: { oauthOutcome: { provider: 'yandex', outcome: 'state' } },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      YANDEX_SIGN_IN_TERMS.outcome.state,
    );
  },
};

/** No provider configured: the email form alone, with its own lead. */
export const EmailOnly: Story = {
  args: { providers: { google: false, yandex: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(LOGIN_PAGE_TERMS.leadEmailOnly),
    ).toBeVisible();
    await expect(
      canvas.queryByText(LOGIN_PAGE_TERMS.divider),
    ).not.toBeInTheDocument();
  },
};

/** A phone: one column, the story text hidden, the buttons stacked. */
export const Phone: Story = {
  globals: { theme: 'dark' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
