import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect, fn } from 'storybook/test';
import { ErrorState, RIDE_DISCOVERY_TERMS, Skeleton } from 'ui';
import { RideGridCard } from '@/features/participant/discovery/components/RideGridCard';
import { makeRide } from './fixtures';

// The discovery grid card (`RideGridCard`, CR-153) — one link to the ride
// page. Loading and error are how `RideGrid` renders the card's slot while
// the list loads or fails.
const meta = {
  title: 'Rides/RideCard',
  component: RideGridCard,
  tags: ['autodocs'],
  args: { ride: makeRide() },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RideGridCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const RegistrationOpen: Story = {
  play: async ({ canvas }) => {
    const link = canvas.getByRole('link');
    await expect(link).toHaveAttribute('href', '/rides/ride-1');
    await expect(
      canvas.getByRole('heading', { name: 'Гравийная сотка по Подмосковью' }),
    ).toBeVisible();
    await expect(canvas.getByText('8 из 20')).toBeVisible();
    await expect(canvas.getByText('Гравийный')).toBeVisible();
  },
};

/** CR-185: no drawn route — no empty cover, an explicit line instead. */
export const NoRoute: Story = {
  args: { ride: makeRide({ routePreview: null }) },
  play: async ({ canvas, canvasElement }) => {
    await expect(
      canvas.getByText(RIDE_DISCOVERY_TERMS.routeMissing),
    ).toBeVisible();
    await expect(
      canvasElement.querySelector('[data-route-missing]'),
    ).not.toBeNull();
  },
};

export const LowSeats: Story = {
  args: { ride: makeRide({ registrationsCount: 18, priceRub: 1500 }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Мало мест')).toBeVisible();
    await expect(canvas.getByText('Осталось 2 места')).toBeVisible();
  },
};

export const FullWithWaitlist: Story = {
  args: { ride: makeRide({ registrationsCount: 20, waitlistCount: 3 }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Список ожидания')).toBeVisible();
    await expect(canvas.getByText('Мест нет · 3 в очереди')).toBeVisible();
  },
};

/** Registration closed — the card stays a link but offers no seats. */
export const RegistrationClosed: Story = {
  args: { ride: makeRide({ status: 'registration_closed' }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Запись закрыта')).toBeVisible();
  },
};

/** The "disabled" card: cancelled — red chip, struck title, no seats. */
export const Cancelled: Story = {
  args: { ride: makeRide({ status: 'cancelled' }) },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByRole('heading', { name: 'Гравийная сотка по Подмосковью' }),
    ).toHaveClass('line-through');
    await expect(canvas.queryByText(/из 20/)).toBeNull();
  },
};

/** Empty data: no route, no metrics — says so instead of dashes or zeros. */
export const Empty: Story = {
  args: {
    ride: makeRide({
      routePreview: null,
      distanceKm: null,
      elevationGainMeters: null,
      paceKmh: null,
      difficulty: null,
      groups: [],
    }),
  },
  play: async ({ canvas }) => {
    await expect(
      canvas.getByText(RIDE_DISCOVERY_TERMS.routeMissing),
    ).toBeVisible();
    await expect(
      canvas.getByText(RIDE_DISCOVERY_TERMS.metricsMissing),
    ).toBeVisible();
    await expect(canvas.queryByText('0')).toBeNull();
  },
};

/** While the list loads (`RideGrid`'s `LoadingCards`). */
export const Loading: Story = {
  render: () => (
    <div aria-busy="true">
      <Skeleton className="h-108 rounded-3xl" />
    </div>
  ),
};

const onRetry = fn();

/** The list failed to load: a plain-language message and «Повторить». */
export const LoadError: Story = {
  render: () => (
    <ErrorState message={RIDE_DISCOVERY_TERMS.loadError} onRetry={onRetry} />
  ),
  play: async ({ canvas, userEvent }) => {
    onRetry.mockClear();
    await expect(canvas.getByRole('alert')).toHaveTextContent(
      RIDE_DISCOVERY_TERMS.loadError,
    );
    await userEvent.click(canvas.getByRole('button'));
    await expect(onRetry).toHaveBeenCalledTimes(1);
  },
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  args: { ride: makeRide({ registrationsCount: 18 }) },
};

export const BothThemes: Story = {
  globals: { theme: 'both' },
  args: { ride: makeRide({ priceRub: 500 }) },
};

export const CancelledBothThemes: Story = {
  globals: { theme: 'both' },
  args: { ride: makeRide({ status: 'cancelled' }) },
};
