import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { NOT_FOUND_TERMS, RIDE_DETAIL_TERMS } from 'ui';
import { NotFoundPanel } from '@/components/site/NotFoundPanel';

// QA live audit 2026-10-08, items 4–5: the app's 404 face.
const meta = {
  title: 'Site/NotFoundPanel',
  component: NotFoundPanel,
  tags: ['autodocs'],
  args: {
    title: NOT_FOUND_TERMS.pageTitle,
    description: NOT_FOUND_TERMS.pageDescription,
  },
} satisfies Meta<typeof NotFoundPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const UnknownPage: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: NOT_FOUND_TERMS.pageTitle,
      }),
    ).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: NOT_FOUND_TERMS.toDiscovery }),
    ).toHaveAttribute('href', '/');
  },
};

export const MissingRide: Story = {
  args: {
    title: RIDE_DETAIL_TERMS.notFoundTitle,
    description: RIDE_DETAIL_TERMS.notFoundDescription,
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: RIDE_DETAIL_TERMS.notFoundTitle,
      }),
    ).toBeVisible();
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
};
