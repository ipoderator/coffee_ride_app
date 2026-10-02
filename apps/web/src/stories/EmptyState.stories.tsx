import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import {
  Button,
  ContoursIllustration,
  EmptyState,
  RIDE_DISCOVERY_TERMS,
  RIDE_LIST_TERMS,
} from 'ui';

// Brand empty states: a topographic contour drawing, a quiet title and a next
// step instead of a bare «Нет данных».
const meta = {
  title: 'States/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const QuietNearby: Story = {
  args: {
    icon: <ContoursIllustration />,
    title: RIDE_DISCOVERY_TERMS.emptyTitle,
    description: RIDE_DISCOVERY_TERMS.emptyDescription,
    action: (
      <a
        href="/organizer/rides/new"
        className="inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
      >
        {RIDE_DISCOVERY_TERMS.createRideLabel}
      </a>
    ),
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText('Рядом пока тихо')).toBeVisible();
    await expect(canvas.getByText('Создать заезд')).toBeVisible();
  },
};

export const NoMatchForFilters: Story = {
  args: {
    icon: <ContoursIllustration />,
    title: RIDE_DISCOVERY_TERMS.emptyFilteredTitle,
    description: RIDE_DISCOVERY_TERMS.emptyFilteredDescription,
    action: (
      <Button variant="secondary">
        {RIDE_DISCOVERY_TERMS.resetFiltersLabel}
      </Button>
    ),
  },
};

export const OrganizerNoRides: Story = {
  args: {
    icon: <ContoursIllustration />,
    title: RIDE_LIST_TERMS.emptyTitle,
    description: RIDE_LIST_TERMS.emptyDescription,
  },
};
