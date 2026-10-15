import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import {
  AUTH_TERMS,
  LEGAL_CONSENT_TERMS,
  OAUTH_SIGNUP_TERMS,
  REGISTER_PAGE_TERMS,
} from 'ui';
import { AuthSplitLayout } from '@/features/auth/layout/AuthSplitLayout';
import { OAuthSignupConsent } from '@/features/auth/oauth-signup/components/OAuthSignupConsent';
import { tickConsents } from './consent-helpers';

// CR-269 (ADR-041): `/register/consent` — a first Google/Yandex sign-in accepts the
// documents before any account or session exists. `fetch` is stubbed per story.

const ENDPOINT = '/api/v1/auth/oauth-signup';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function problem(status: number, code: string): Response {
  return json(
    {
      type: `https://coffee-ride.example/errors/${code}`,
      title: 'Error',
      status,
      detail: 'Request failed.',
      instance: '/v1/auth/oauth-signup',
      code,
    },
    status,
  );
}

function stub(
  read: () => Response | Promise<Response>,
  complete: () => Response = () => problem(500, 'internal_error'),
) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      if (new URL(raw, window.location.href).pathname === ENDPOINT) {
        return (init?.method ?? 'GET') === 'GET' ? read() : complete();
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

const pending = () => json({ provider: 'yandex', email: 'rider@yandex.ru' });

const meta = {
  title: 'Auth/OAuthSignupConsent',
  component: OAuthSignupConsent,
  tags: ['autodocs'],
  parameters: { nextjs: { appDirectory: true }, layout: 'fullscreen' },
  render: () => (
    <AuthSplitLayout
      storyTitle={REGISTER_PAGE_TERMS.storyTitle}
      storyBody={REGISTER_PAGE_TERMS.storyBody}
    >
      <OAuthSignupConsent />
    </AuthSplitLayout>
  ),
} satisfies Meta<typeof OAuthSignupConsent>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The provider and the address, two unticked consents, the button disabled. */
export const Ready: Story = {
  beforeEach: stub(pending),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByText(
        OAUTH_SIGNUP_TERMS.lead('Яндекс ID', 'rider@yandex.ru'),
      ),
    ).toBeVisible();
    const submit = canvas.getByRole('button', {
      name: OAUTH_SIGNUP_TERMS.submit,
    });
    await expect(submit).toBeDisabled();
    await expect(canvas.getByText(LEGAL_CONSENT_TERMS.hint(2))).toBeVisible();
    await tickConsents(canvas, userEvent);
    await expect(submit).toBeEnabled();
    await expect(
      canvas.getByRole('button', { name: OAUTH_SIGNUP_TERMS.cancel }),
    ).toBeEnabled();
  },
};

export const ReadyDark: Story = { ...Ready, globals: { theme: 'dark' } };

export const ReadyPhone: Story = {
  ...Ready,
  globals: { theme: 'dark' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/** Waiting for the pending sign-up. */
export const Loading: Story = {
  beforeEach: stub(() => new Promise<Response>(() => {})),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole('status')).toBeInTheDocument();
  },
};

/** No pending sign-up (10 minutes passed, already used, another browser). */
export const Expired: Story = {
  beforeEach: stub(() => problem(410, 'oauth_signup_expired')),
  globals: { theme: 'both' },
  play: async ({ canvas }) => {
    await expect(
      (await canvas.findAllByText(OAUTH_SIGNUP_TERMS.expiredTitle))[0],
    ).toBeVisible();
    await expect(
      canvas.getAllByRole('link', {
        name: OAUTH_SIGNUP_TERMS.expiredAction,
      })[0],
    ).toHaveAttribute('href', '/register');
  },
};

/** The API could not be reached: a retry, not a dead end. */
export const LoadFailed: Story = {
  beforeEach: stub(() => problem(503, 'service_unavailable')),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(AUTH_TERMS.genericError),
    ).toBeVisible();
  },
};

/** The documents changed while the page was open. */
export const VersionOutdated: Story = {
  beforeEach: stub(pending, () => problem(409, 'legal_version_outdated')),
  globals: { theme: 'dark' },
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText(
      OAUTH_SIGNUP_TERMS.lead('Яндекс ID', 'rider@yandex.ru'),
    );
    await tickConsents(canvas, userEvent);
    await userEvent.click(
      canvas.getByRole('button', { name: OAUTH_SIGNUP_TERMS.submit }),
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      LEGAL_CONSENT_TERMS.versionOutdated,
    );
  },
};

/** The account could not be created (blocked meanwhile). */
export const Failed: Story = {
  beforeEach: stub(pending, () => problem(409, 'oauth_signup_failed')),
  play: async ({ canvas, userEvent }) => {
    await canvas.findByText(
      OAUTH_SIGNUP_TERMS.lead('Яндекс ID', 'rider@yandex.ru'),
    );
    await tickConsents(canvas, userEvent);
    await userEvent.click(
      canvas.getByRole('button', { name: OAUTH_SIGNUP_TERMS.submit }),
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent(
      OAUTH_SIGNUP_TERMS.failed,
    );
  },
};
