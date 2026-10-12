import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn, within } from 'storybook/test';
import { ToastProvider } from 'ui';
import { ShareLinkDialog } from '@/features/participant/ride-detail/components/ShareLinkDialog';

// CR-242: «Поделиться»'s last step — no share sheet, no clipboard — shows
// the link for a manual copy, with one more try at copying.

const meta = {
  title: 'Participant/ShareLinkDialog',
  component: ShareLinkDialog,
  tags: ['autodocs'],
  args: {
    url: 'https://coffee-ride.example/rides/47c925f9-2b2a-4526-8305-a07d2ea2c1fa',
    open: true,
    onClose: fn(),
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof ShareLinkDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  globals: { theme: 'dark' },
  play: async () => {
    // The dialog renders in a portal on `document.body`.
    const page = within(document.body);
    const dialog = await page.findByRole('dialog', {
      name: 'Ссылка на заезд',
    });
    await expect(dialog).toBeVisible();
    await expect(page.getByLabelText('Ссылка')).toHaveValue(
      'https://coffee-ride.example/rides/47c925f9-2b2a-4526-8305-a07d2ea2c1fa',
    );
  },
};

/** The retry failed too: say so, keep the link on screen. */
export const CopyFailedAgain: Story = {
  beforeEach: () => {
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const execCommand = document.execCommand;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    document.execCommand = () => false;
    return () => {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard);
      else delete (navigator as unknown as Record<string, unknown>).clipboard;
      document.execCommand = execCommand;
    };
  },
  play: async ({ userEvent }) => {
    const page = within(document.body);
    await userEvent.click(
      await page.findByRole('button', { name: 'Скопировать' }),
    );
    await expect(await page.findByRole('alert')).toHaveTextContent(
      'Не удалось скопировать ссылку.',
    );
  },
};
