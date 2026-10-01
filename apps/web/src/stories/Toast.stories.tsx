import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, userEvent } from 'storybook/test';
import { Button, ToastProvider, useToast, type ToastTone } from 'ui';

// The action-feedback toast (CR-103). CR-170: it rises in, a success draws a
// check mark after it, and it fades out before leaving — no fill, glow or
// glass; reduced motion shows and removes it without animation.
function Trigger({ message, tone }: { message: string; tone: ToastTone }) {
  const { showToast } = useToast();
  return (
    <Button variant="secondary" onClick={() => showToast(message, tone)}>
      Показать уведомление
    </Button>
  );
}

const meta = {
  title: 'Feedback/Toast',
  component: Trigger,
  tags: ['autodocs'],
  args: { message: 'Вы зарегистрированы на заезд.', tone: 'success' },
  argTypes: {
    tone: { control: 'inline-radio', options: ['success', 'danger', 'info'] },
  },
  decorators: [
    (Story) => (
      <ToastProvider>
        <Story />
      </ToastProvider>
    ),
  ],
} satisfies Meta<typeof Trigger>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Показать уведомление' }),
    );
    const toast = await canvas.findByText('Вы зарегистрированы на заезд.');
    const card = toast.parentElement!;
    await expect(card.className).toContain('motion-safe:animate-rise-in');
    await expect(card.querySelector('[data-toast-mark]')).not.toBeNull();
  },
};

export const Danger: Story = {
  args: {
    message: 'Не удалось записаться. Попробуйте ещё раз.',
    tone: 'danger',
  },
  play: async ({ canvas }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Показать уведомление' }),
    );
    const toast = await canvas.findByText(
      'Не удалось записаться. Попробуйте ещё раз.',
    );
    await expect(
      toast.parentElement!.querySelector('[data-toast-mark]'),
    ).toBeNull();
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: Success.play,
};
