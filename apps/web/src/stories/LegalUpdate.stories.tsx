import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { LEGAL_CONSENT_TERMS, LEGAL_TERMS, LEGAL_UPDATE_TERMS } from 'ui';
import { LegalUpdateForm } from '@/features/legal/reconsent/components/LegalUpdateForm';
import { SessionProvider } from '@/lib/auth/session-context';
import {
  PERSONAL_DATA_CONSENT_LABEL,
  TERMS_CONSENT_LABEL,
} from './consent-helpers';

// CR-269 (ADR-041): `/legal-update` — a signed-in person accepts a material new
// version; documents, sign-out and the deletion request stay open. `fetch` serves
// `/v1/auth/me` with the pending documents.

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

function signedInWith(pending: string[]) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      if (new URL(raw, window.location.href).pathname === '/api/v1/auth/me') {
        return new Response(
          JSON.stringify({ user: USER, legal: { pending } }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

function Screen() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-10 md:px-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-h1 text-text">{LEGAL_UPDATE_TERMS.title}</h1>
        <p className="text-body text-text-secondary">
          {LEGAL_UPDATE_TERMS.lead}
        </p>
      </div>
      <SessionProvider>
        <LegalUpdateForm next="/me" />
      </SessionProvider>
    </main>
  );
}

const meta = {
  title: 'Site/LegalUpdate',
  component: Screen,
  tags: ['autodocs'],
  parameters: { nextjs: { appDirectory: true } },
} satisfies Meta<typeof Screen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Both documents changed: both described, two boxes, sign-out and deletion open. */
export const BothDocuments: Story = {
  beforeEach: signedInWith(['terms', 'personal_data_consent']),
  play: async ({ canvas, userEvent }) => {
    await expect(
      await canvas.findByRole('link', {
        name: new RegExp(LEGAL_TERMS.termsTitle),
      }),
    ).toHaveAttribute('href', '/terms');
    const submit = canvas.getByRole('button', {
      name: LEGAL_UPDATE_TERMS.submit,
    });
    await expect(submit).toBeDisabled();
    await userEvent.click(canvas.getByLabelText(TERMS_CONSENT_LABEL));
    await userEvent.click(canvas.getByLabelText(PERSONAL_DATA_CONSENT_LABEL));
    await expect(submit).toBeEnabled();
    await expect(
      canvas.getByRole('button', { name: LEGAL_UPDATE_TERMS.logout }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole('link', { name: LEGAL_UPDATE_TERMS.deleteLink }),
    ).toHaveAttribute('href', expect.stringMatching(/^mailto:/));
  },
};

export const BothDocumentsDark: Story = {
  ...BothDocuments,
  globals: { theme: 'dark' },
};

/** Only the terms changed: one box, the hint in the singular. */
export const TermsOnly: Story = {
  beforeEach: signedInWith(['terms']),
  globals: { theme: 'both' },
  play: async ({ canvas }) => {
    await expect(
      (await canvas.findAllByLabelText(TERMS_CONSENT_LABEL))[0],
    ).toBeVisible();
    await expect(
      canvas.queryAllByLabelText(PERSONAL_DATA_CONSENT_LABEL),
    ).toHaveLength(0);
    await expect(
      canvas.getAllByText(LEGAL_CONSENT_TERMS.hint(1))[0],
    ).toBeVisible();
  },
};

export const Phone: Story = {
  ...BothDocuments,
  globals: { theme: 'dark' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
