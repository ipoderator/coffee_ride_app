import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, within } from 'storybook/test';
import { AVATAR_TERMS } from 'ui';
import { AvatarUploadForm } from '@/features/participant/profile/components/AvatarUploadForm';

// The participant's profile photo (CR-062). The organizer profile's
// `AvatarUploadForm` is the same form over its own endpoints.

const meta = {
  title: 'Participant/AvatarUploadForm',
  component: AvatarUploadForm,
  tags: ['autodocs'],
  args: { initialAvatarUrl: null, name: 'Иван Иванов' },
} satisfies Meta<typeof AvatarUploadForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: AVATAR_TERMS.upload }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole('button', { name: AVATAR_TERMS.delete }),
    ).not.toBeInTheDocument();
  },
};

export const WithPhoto: Story = {
  args: { initialAvatarUrl: '/v1/users/me/avatar' },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('button', { name: AVATAR_TERMS.replace }),
    ).toBeVisible();
  },
};

/** CR-200 (KI-087): delete asks in the app's own dialog, not the browser's
 * `window.confirm`. Left open so the axe check covers the dialog. */
export const DeleteConfirm: Story = {
  args: { initialAvatarUrl: '/v1/users/me/avatar' },
  globals: { theme: 'dark' },
  play: async ({ canvas, canvasElement, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: AVATAR_TERMS.delete }),
    );
    const dialog = await within(canvasElement.ownerDocument.body).findByRole(
      'dialog',
      { name: AVATAR_TERMS.deleteConfirmTitle },
    );
    await expect(dialog).toHaveTextContent(
      AVATAR_TERMS.deleteConfirmDescription,
    );
    await expect(
      within(dialog).getByRole('button', { name: AVATAR_TERMS.deleteKeep }),
    ).toBeVisible();
  },
};
