import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { LEGAL_TERMS } from 'ui';
import { LegalDocument } from '@/features/legal/components/LegalDocument';
import { LEGAL_CONTACT_EMAIL } from '@/features/legal/content';

// CR-247: `/privacy` and `/terms`. CR-268 (ADR-041): `/personal-data-consent`,
// the version line and the version history.

const meta = {
  title: 'Site/LegalDocument',
  component: LegalDocument,
  tags: ['autodocs'],
  args: { type: 'privacy', title: LEGAL_TERMS.privacyTitle },
  parameters: { nextjs: { appDirectory: true } },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await expect(
      canvas.getByRole('heading', { level: 2, name: LEGAL_TERMS.historyTitle }),
    ).toBeVisible();
    await expect(canvas.getByText(/^Версия 1\.0, действует с/)).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: LEGAL_CONTACT_EMAIL }),
    ).toHaveAttribute('href', `mailto:${LEGAL_CONTACT_EMAIL}`);
  },
} satisfies Meta<typeof LegalDocument>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Privacy: Story = {};

export const PrivacyDark: Story = { globals: { theme: 'dark' } };

export const Terms: Story = {
  args: { type: 'terms', title: LEGAL_TERMS.termsTitle },
};

export const TermsDark: Story = {
  ...Terms,
  globals: { theme: 'dark' },
};

export const PersonalDataConsent: Story = {
  args: {
    type: 'personal_data_consent',
    title: LEGAL_TERMS.personalDataConsentTitle,
  },
};

export const PersonalDataConsentDark: Story = {
  ...PersonalDataConsent,
  globals: { theme: 'dark' },
};

/** A phone: the document reads in one column without sideways scrolling. */
export const PersonalDataConsentPhone: Story = {
  ...PersonalDataConsent,
  globals: { theme: 'light' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
