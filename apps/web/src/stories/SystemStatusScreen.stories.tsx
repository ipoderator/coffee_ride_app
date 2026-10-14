import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { SYSTEM_STATUS_TERMS } from 'ui';
import { SystemStatusScreen } from '@/components/site/SystemStatusScreen';

// CR-265: the auth mockup's «Техработы» tab (`reference/coffee-ride-auth-mockup`)
// and the unexpected-error state in the same frame. «Обновить страницу» is not
// clicked here — it reloads the Storybook frame.

const meta = {
  title: 'Site/SystemStatusScreen',
  component: SystemStatusScreen,
  tags: ['autodocs'],
  args: { kind: 'maintenance', fullScreen: true },
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof SystemStatusScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Planned maintenance, both themes; Tab reaches refresh, then the letter. */
export const Maintenance: Story = {
  globals: { theme: 'both' },
  play: async ({ canvas, userEvent }) => {
    const [refresh] = canvas.getAllByRole('button', {
      name: SYSTEM_STATUS_TERMS.refresh,
    });
    const [contact] = canvas.getAllByRole('link', {
      name: SYSTEM_STATUS_TERMS.contact,
    });
    await expect(contact).toHaveAttribute(
      'href',
      'mailto:glebchurkin48@gmail.com',
    );
    await userEvent.tab();
    await expect(refresh).toHaveFocus();
    await userEvent.tab();
    await expect(contact).toHaveFocus();
  },
};

/** A phone: the title wraps, the two actions stay side by side or stack. */
export const MaintenancePhone: Story = {
  globals: { theme: 'dark' },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};

/** The unexpected-error state under the site header (not full screen). */
export const UnexpectedError: Story = {
  globals: { theme: 'both' },
  args: { kind: 'error', fullScreen: false },
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByRole('heading', {
        level: 1,
        name: SYSTEM_STATUS_TERMS.error.title,
      })[0],
    ).toBeVisible();
  },
};

export const UnexpectedErrorPhone: Story = {
  globals: { theme: 'light' },
  args: { kind: 'error', fullScreen: true },
  parameters: { viewport: { defaultViewport: 'mobile1' } },
};
