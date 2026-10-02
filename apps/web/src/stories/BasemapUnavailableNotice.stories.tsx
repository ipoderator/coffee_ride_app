import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { RIDE_DISCOVERY_ROW_TERMS } from 'ui';
import { BasemapUnavailableNotice } from '@/features/participant/discovery/components/BasemapUnavailableNotice';

// CR-185: the notice `DiscoveryMap` lays over the map area when the basemap
// didn't load — rendered here over a stand-in blank map sheet.
const meta = {
  title: 'Discovery/BasemapUnavailableNotice',
  component: BasemapUnavailableNotice,
  args: { onRetry: fn() },
  decorators: [
    (Story) => (
      <div className="relative h-96 w-full max-w-3xl rounded-xl border border-border bg-bg">
        <div className="absolute top-2 right-14 left-2 flex lg:top-auto lg:right-auto lg:bottom-8 lg:left-4">
          <Story />
        </div>
      </div>
    ),
  ],
} satisfies Meta<typeof BasemapUnavailableNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

/** «Повторить» asks the map to be re-created; nothing else is reset. */
export const RetryRecreatesTheMap: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(
      canvas.getByText(RIDE_DISCOVERY_ROW_TERMS.basemapUnavailableTitle),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole('button', {
        name: RIDE_DISCOVERY_ROW_TERMS.basemapRetry,
      }),
    );
    await expect(args.onRetry).toHaveBeenCalledTimes(1);
  },
};

export const BothThemes: Story = {
  globals: { theme: 'both' },
};
