import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import {
  AUTH_TERMS,
  GOOGLE_SIGN_IN_TERMS,
  LEGAL_CONSENT_TERMS,
  PASSWORD_TERMS,
  REGISTER_PAGE_TERMS,
  YANDEX_SIGN_IN_TERMS,
} from 'ui';
import { AuthSplitLayout } from '@/features/auth/layout/AuthSplitLayout';
import { OAuthSignIn } from '@/features/auth/oauth/components/OAuthSignIn';
import { RegisterForm } from '@/features/auth/register/components/RegisterForm';
import type { SignInProvider } from '@/features/auth/oauth/api';
import {
  PERSONAL_DATA_CONSENT_LABEL,
  TERMS_CONSENT_LABEL,
  tickConsents,
} from './consent-helpers';

// CR-262: `/register` laid out like the auth mockup's «Регистрация» tab
// (`reference/coffee-ride-auth-mockup`). The page itself is an async server
// component (it asks the API which providers are on), so the story assembles the
// same parts: `AuthSplitLayout`, `OAuthSignIn intent="register"`, `RegisterForm`.

const NEXT = '/rides/ride-1';

function RegisterScreen({
  providers,
}: {
  providers: Record<SignInProvider, boolean>;
}) {
  const hasProviders = Object.values(providers).some(Boolean);
  return (
    <AuthSplitLayout
      storyTitle={REGISTER_PAGE_TERMS.storyTitle}
      storyBody={REGISTER_PAGE_TERMS.storyBody}
    >
      <h1 className="text-h1 text-text">{REGISTER_PAGE_TERMS.title}</h1>
      <p className="mt-3 text-body text-text-secondary">
        {hasProviders
          ? REGISTER_PAGE_TERMS.lead
          : REGISTER_PAGE_TERMS.leadEmailOnly}
      </p>
      <div className="mt-6 flex flex-col gap-5">
        {hasProviders && (
          <>
            <OAuthSignIn next={NEXT} providers={providers} intent="register" />
            <div
              className="flex items-center gap-3 text-body-sm text-text-secondary"
              aria-hidden="true"
            >
              <span className="h-px flex-1 bg-border" />
              {REGISTER_PAGE_TERMS.divider}
              <span className="h-px flex-1 bg-border" />
            </div>
          </>
        )}
        <RegisterForm next={NEXT} />
      </div>
    </AuthSplitLayout>
  );
}

const meta = {
  title: 'Auth/RegisterScreen',
  component: RegisterScreen,
  tags: ['autodocs'],
  args: { providers: { google: true, yandex: true } },
  parameters: { nextjs: { appDirectory: true }, layout: 'fullscreen' },
} satisfies Meta<typeof RegisterScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both providers, equal and first; Google then Yandex ID, each keeping `next`. */
export const Default: Story = {
  globals: { theme: 'both' },
  play: async ({ canvas }) => {
    const google = canvas.getAllByRole('link', {
      name: GOOGLE_SIGN_IN_TERMS.continueButton,
    })[0]!;
    await expect(google).toHaveAttribute(
      'href',
      `/api/v1/auth/google?next=${encodeURIComponent(NEXT)}`,
    );
    await expect(
      canvas.getAllByRole('link', {
        name: YANDEX_SIGN_IN_TERMS.continueButton,
      })[0],
    ).toHaveAttribute(
      'href',
      `/api/v1/auth/yandex?next=${encodeURIComponent(NEXT)}`,
    );
  },
};

/** A strong password typed twice: four segments, «надёжный», «Пароли совпадают». */
export const StrongMatchingPassword: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'coffee-ride-2026',
    );
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.confirmPasswordLabel),
      'coffee-ride-2026',
    );
    await expect(
      canvas.getByText(
        `${PASSWORD_TERMS.strengthLabel}: ${PASSWORD_TERMS.strength.strong}`,
      ),
    ).toBeInTheDocument();
    await expect(canvas.getByText(PASSWORD_TERMS.match)).toBeInTheDocument();
  },
};

/** A short password and a different repeat — said in words, not colour alone. */
export const WeakMismatchedPassword: Story = {
  globals: { theme: 'dark' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'velo',
    );
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.confirmPasswordLabel),
      'velo2',
    );
    await expect(
      canvas.getByText(
        `${PASSWORD_TERMS.strengthLabel}: ${PASSWORD_TERMS.strength.too_short}`,
      ),
    ).toBeInTheDocument();
    await expect(canvas.getByText(PASSWORD_TERMS.mismatch)).toBeInTheDocument();
  },
};

/** The show/hide toggle reveals one field at a time. */
export const PasswordRevealed: Story = {
  globals: { theme: 'light' },
  play: async ({ canvas, userEvent }) => {
    const password = canvas.getByLabelText(AUTH_TERMS.passwordLabel);
    await userEvent.type(password, 'coffee-ride-2026');
    await userEvent.click(
      canvas.getAllByRole('button', { name: PASSWORD_TERMS.show })[0]!,
    );
    await expect(password).toHaveAttribute('type', 'text');
    await expect(
      canvas.getByRole('button', { name: PASSWORD_TERMS.hide }),
    ).toHaveAttribute('aria-pressed', 'true');
  },
};

/** No provider configured: the email form alone, with its own lead. */
export const EmailOnly: Story = {
  args: { providers: { google: false, yandex: false } },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(REGISTER_PAGE_TERMS.leadEmailOnly),
    ).toBeVisible();
    await expect(
      canvas.queryByText(REGISTER_PAGE_TERMS.divider),
    ).not.toBeInTheDocument();
  },
};

/** A phone: one column, the story panel hidden, the buttons stacked. */
export const Phone: Story = {
  globals: { theme: 'dark' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/**
 * CR-268 (ADR-041): two separate, unticked consents; «Зарегистрироваться» stays
 * disabled, with the reason in words, until both are ticked. Each links its own
 * document in a new tab.
 */
export const ConsentsRequired: Story = {
  globals: { theme: 'light' },
  play: async ({ canvas, userEvent }) => {
    const submit = canvas.getAllByRole('button', {
      name: AUTH_TERMS.registerSubmit,
    })[0]!;
    const terms = canvas.getAllByLabelText(TERMS_CONSENT_LABEL)[0]!;
    const personalData = canvas.getAllByLabelText(
      PERSONAL_DATA_CONSENT_LABEL,
    )[0]!;
    await expect(terms).not.toBeChecked();
    await expect(personalData).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await expect(
      canvas.getAllByText(LEGAL_CONSENT_TERMS.hint(2))[0],
    ).toBeVisible();

    await userEvent.click(terms);
    await expect(submit).toBeDisabled();
    await userEvent.click(personalData);
    await expect(submit).toBeEnabled();
    await expect(
      canvas.queryAllByText(LEGAL_CONSENT_TERMS.hint(2)),
    ).toHaveLength(0);

    const consentLink = canvas.getAllByRole('link', {
      name: new RegExp(LEGAL_CONSENT_TERMS.personalDataLink),
    })[0]!;
    await expect(consentLink).toHaveAttribute('href', '/personal-data-consent');
    await expect(consentLink).toHaveAttribute('target', '_blank');
  },
};

/** The documents changed after the page loaded: the API refuses, the form says so. */
export const ConsentVersionOutdated: Story = {
  globals: { theme: 'dark' },
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      if (
        new URL(raw, window.location.href).pathname === '/api/v1/auth/register'
      ) {
        return new Response(
          JSON.stringify({
            type: 'https://coffee-ride.example/errors/legal_version_outdated',
            title: 'Legal document version outdated',
            status: 409,
            detail: 'The accepted version of terms is not the current one.',
            instance: '/v1/auth/register',
            code: 'legal_version_outdated',
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        );
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.emailLabel),
      'rider@example.com',
    );
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.passwordLabel),
      'a-strong-password-123',
    );
    await userEvent.type(
      canvas.getByLabelText(AUTH_TERMS.confirmPasswordLabel),
      'a-strong-password-123',
    );
    await tickConsents(canvas, userEvent);
    await userEvent.click(
      canvas.getByRole('button', { name: AUTH_TERMS.registerSubmit }),
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      LEGAL_CONSENT_TERMS.versionOutdated,
    );
  },
};
