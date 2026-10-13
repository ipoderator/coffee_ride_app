import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { LEGAL_TERMS } from 'ui';
import { LegalDocument } from '@/features/legal/components/LegalDocument';
import {
  LEGAL_CONTACT_EMAIL,
  PRIVACY_POLICY,
  TERMS_OF_USE,
} from '@/features/legal/content';

// CR-247: `/privacy` and `/terms`.

const meta = {
  title: 'Site/LegalDocument',
  component: LegalDocument,
  tags: ['autodocs'],
  args: { title: LEGAL_TERMS.privacyTitle, content: PRIVACY_POLICY },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole('heading', { level: 1 })).toHaveLength(1);
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
  args: { title: LEGAL_TERMS.termsTitle, content: TERMS_OF_USE },
};

export const TermsDark: Story = {
  ...Terms,
  globals: { theme: 'dark' },
};
