import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { Lock } from 'lucide-react';
import { expect } from 'storybook/test';
import { Notice, RIDE_ROUTE_TERMS } from 'ui';

// CR-187: why a screen behaves as it does — in place of a disabled control.

const meta = {
  title: 'Primitives/Notice',
  component: Notice,
  args: {
    title: RIDE_ROUTE_TERMS.lockedTitle,
    children: RIDE_ROUTE_TERMS.lockedText,
    icon: <Lock className="size-5" />,
  },
  parameters: { layout: 'padded' },
  globals: { theme: 'both' },
} satisfies Meta<typeof Notice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithIcon: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getAllByText(RIDE_ROUTE_TERMS.lockedTitle)[0]!,
    ).toBeVisible();
  },
};

/** Title only — the explanation is optional. */
export const TitleOnly: Story = {
  args: { children: undefined, icon: undefined },
};
