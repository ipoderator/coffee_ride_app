import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { OrganizerJournal } from '../features/participant/ride-detail/components/OrganizerJournal';

// CR-173 («Журнал организатора»): the organizer's past rides as quiet ledger
// lines — counts as words, no stars or badges; a thin sample shows no percentage.
const meta = {
  title: 'Rides/OrganizerJournal',
  component: OrganizerJournal,
  tags: ['autodocs'],
} satisfies Meta<typeof OrganizerJournal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Established: Story = {
  args: {
    journal: {
      finishedCount: 11,
      cancelledCount: 1,
      completionPercent: 92,
      typicalPaceKmh: 26,
      typicalDistanceKm: 80,
      bicycleTypes: ['gravel', 'road'],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Провёл 11 заездов')).toBeVisible();
    await expect(canvas.getByText('Состоялись 11 из 12 · 92 %')).toBeVisible();
  },
};

export const ThinSample: Story = {
  args: {
    journal: {
      finishedCount: 1,
      cancelledCount: 1,
      completionPercent: null,
      typicalPaceKmh: null,
      typicalDistanceKm: null,
      bicycleTypes: [],
    },
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Отменён 1 заезд')).toBeVisible();
  },
};

export const FirstRide: Story = {
  args: {
    journal: {
      finishedCount: 0,
      cancelledCount: 0,
      completionPercent: null,
      typicalPaceKmh: null,
      typicalDistanceKm: null,
      bicycleTypes: [],
    },
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(/Завершённых заездов пока нет/),
    ).toBeVisible();
  },
};
