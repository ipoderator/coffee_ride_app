import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { RescheduleRideCard } from '@/features/organizer/rides/components/RescheduleRideCard';

// CR-190: «Перенести заезд» on a published ride's overview — the closed card,
// the card after an earlier move, the open form and the confirmation. The
// clock is fixed so «сейчас» and the date picker's minimum never drift.

const NOW = new Date('2099-09-28T09:00:00.000Z');

const meta = {
  title: 'Organizer/RescheduleRideCard',
  component: RescheduleRideCard,
  tags: ['autodocs'],
  args: {
    ride: {
      id: 'ride-1',
      status: 'registration_open',
      startsAt: '2099-10-04T05:00:00.000Z',
      startTimezone: 'Europe/Moscow',
    },
    registrationsCount: 12,
    waitlistCount: 3,
    lastReschedule: null,
    onRescheduled: fn(),
    now: () => NOW,
  },
  decorators: [
    (Story) => (
      <div className="max-w-3xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RescheduleRideCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Closed: the current start and the one action. */
export const Closed: Story = {
  globals: { theme: 'both' },
  play: async ({ canvas }) => {
    // `both` renders the card once per theme.
    await expect(
      canvas.getAllByRole('button', { name: 'Перенести заезд' }),
    ).toHaveLength(2);
  },
};

/** Moved once already: the previous start and the stated reason. */
export const AfterAMove: Story = {
  args: {
    lastReschedule: {
      previousStartsAt: '2099-10-03T05:00:00.000Z',
      startsAt: '2099-10-04T05:00:00.000Z',
      reason: 'Обещают грозу в субботу, переносим на воскресенье.',
      rescheduledAt: '2099-09-27T12:00:00.000Z',
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Перенесён, было')).toBeVisible();
  },
};

/** Open form: prefilled with the current start, who will be told. */
export const FormOpen: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Перенести заезд' }),
    );
    await expect(canvas.getByLabelText('Новое время старта')).toHaveValue(
      '08:00',
    );
    await expect(canvas.getByTestId('reschedule-recipients')).toHaveTextContent(
      '12 записавшихся участников и 3 человека из листа ожидания.',
    );
  },
};

/** Nobody to notify: said plainly instead of an empty list. */
export const NobodyToNotify: Story = {
  args: { registrationsCount: 0, waitlistCount: 0 },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Перенести заезд' }),
    );
    await expect(canvas.getByTestId('reschedule-recipients')).toHaveTextContent(
      'уведомление никому не придёт',
    );
  },
};

/** Validation: no reason, start unchanged. */
export const ValidationErrors: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Перенести заезд' }),
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Продолжить' }));
    await expect(canvas.getByText('Напишите причину переноса.')).toBeVisible();
  },
};

/** The confirmation: «было → станет» and the recipients once more. */
export const Confirmation: Story = {
  play: async ({ canvas, userEvent, canvasElement }) => {
    await userEvent.click(
      canvas.getByRole('button', { name: 'Перенести заезд' }),
    );
    const time = canvas.getByLabelText('Новое время старта');
    await userEvent.clear(time);
    await userEvent.type(time, '10:00');
    await userEvent.type(
      canvas.getByLabelText('Причина переноса'),
      'Обещают грозу утром.',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Продолжить' }));
    const body = canvasElement.ownerDocument.body;
    await expect(body.querySelector('[role="dialog"]')).toHaveTextContent(
      'Перенести заезд?',
    );
  },
};
