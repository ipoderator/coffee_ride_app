import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import type { ReactNode } from 'react';
import { expect } from 'storybook/test';
import type { RideStatus } from 'types';
import { RIDE_STATUS_TERMS, Skeleton, StatusBadge } from 'ui';
import { RideStatusPill } from '@/features/participant/discovery/components/RideGridCard';
import { discoveryStatusTerm } from '@/features/participant/discovery/lib/ride-metrics';
import { makeRide } from './fixtures';

// A ride's status as the app shows it: `RIDE_STATUS_TERMS` (label + tone per
// lifecycle state), and the discovery cover's `RideStatusPill`, where
// `discoveryStatusTerm` swaps an open ride's label for «Мало мест» /
// «Список ожидания» when seats run low or out.
const STATUSES = Object.keys(RIDE_STATUS_TERMS) as RideStatus[];

/** The pill sits on the route cover, which is dark in both themes and renders
 * its chips in a `dark` token scope (`RouteCover`'s `topLeft` slot). */
function OnCover({ children }: { children: ReactNode }) {
  return (
    <div className="inline-flex rounded-2xl bg-cover-bg p-3">
      <div className="dark">{children}</div>
    </div>
  );
}

const meta = {
  title: 'Rides/RideStatus',
  component: RideStatusPill,
  tags: ['autodocs'],
  args: RIDE_STATUS_TERMS.registration_open,
  argTypes: {
    tone: {
      control: 'inline-radio',
      options: ['neutral', 'success', 'warning', 'info', 'danger'],
    },
  },
  render: (args) => (
    <OnCover>
      <RideStatusPill {...args} />
    </OnCover>
  ),
} satisfies Meta<typeof RideStatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegistrationOpen: Story = {};

export const LowSeats: Story = {
  args: discoveryStatusTerm(
    makeRide({ participantLimit: 10, registrationsCount: 8 }),
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Мало мест')).toBeVisible();
  },
};

export const Waitlist: Story = {
  args: discoveryStatusTerm(
    makeRide({ participantLimit: 10, registrationsCount: 10 }),
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Список ожидания')).toBeVisible();
  },
};

/** Registration closed — the ride is no longer bookable (the "disabled" read). */
export const RegistrationClosed: Story = {
  args: RIDE_STATUS_TERMS.registration_closed,
};

/** Error-level: the one solid red chip. */
export const Cancelled: Story = {
  args: RIDE_STATUS_TERMS.cancelled,
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Отменён')).toHaveClass('bg-danger');
  },
};

export const Draft: Story = {
  args: RIDE_STATUS_TERMS.draft,
};

export const Loading: Story = {
  render: () => <Skeleton className="h-7 w-36 rounded-full" />,
};

function AllStatuses() {
  return (
    <table className="text-body-sm">
      <caption className="sr-only">Статусы заезда</caption>
      <thead>
        <tr className="text-left text-text-secondary">
          <th scope="col" className="pr-6 pb-2 font-medium">
            Статус
          </th>
          <th scope="col" className="pr-6 pb-2 font-medium">
            В кабинете
          </th>
          <th scope="col" className="pb-2 font-medium">
            На обложке
          </th>
        </tr>
      </thead>
      <tbody>
        {STATUSES.map((status) => (
          <tr key={status}>
            <td className="py-1.5 pr-6 font-mono text-label text-text-muted">
              {status}
            </td>
            <td className="py-1.5 pr-6">
              <StatusBadge {...RIDE_STATUS_TERMS[status]} />
            </td>
            <td className="py-1.5">
              <OnCover>
                <RideStatusPill {...RIDE_STATUS_TERMS[status]} />
              </OnCover>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Every lifecycle status: its label is always there, never colour alone. */
export const AllLifecycleStatuses: Story = {
  render: () => <AllStatuses />,
  play: async ({ canvas }) => {
    for (const status of STATUSES) {
      await expect(
        canvas.getAllByText(RIDE_STATUS_TERMS[status].label),
      ).toHaveLength(2);
    }
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  render: () => <AllStatuses />,
};

export const BothThemes: Story = {
  globals: { theme: 'both' },
  render: () => <AllStatuses />,
};
