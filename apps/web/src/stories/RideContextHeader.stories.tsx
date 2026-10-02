import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { RIDE_CONTEXT_TERMS, RIDE_LIST_TERMS } from 'ui';
import { RideContextHeader } from '@/components/cabinet/RideContextHeader';

// CR-185: which ride a per-ride organizer page (participants, updates) is
// about. `GET /api/v1/rides/:id` is stubbed per story.

const RIDE = {
  id: 'ride-7',
  title: 'Гравий: круг по Серебряному бору',
  status: 'started',
  startsAt: '2026-10-02T06:00:00Z',
  startTimezone: 'Europe/Moscow',
};

function stub(ride: Record<string, unknown> | null) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(raw, window.location.href);
      if (pathname === '/api/v1/rides/ride-7') {
        return ride
          ? new Response(JSON.stringify({ ride, isOwner: true }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : new Response(
              JSON.stringify({ status: 500, code: 'internal_error' }),
              { status: 500 },
            );
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

const meta = {
  title: 'Organizer/RideContextHeader',
  component: RideContextHeader,
  args: { rideId: 'ride-7' },
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RideContextHeader>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Started: Story = {
  beforeEach: stub(RIDE),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(RIDE.title)).toBeVisible();
    await expect(
      canvas.getByRole('link', { name: `${RIDE_CONTEXT_TERMS.manageLink} →` }),
    ).toHaveAttribute('href', '/organizer/rides/ride-7/edit');
  },
};

/** Start passed while registration is still open — flagged, as everywhere. */
export const OverdueStart: Story = {
  beforeEach: stub({
    ...RIDE,
    status: 'registration_open',
    startsAt: '2026-10-01T05:00:00Z',
  }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_LIST_TERMS.overdueBadge),
    ).toBeVisible();
  },
};

export const LoadError: Story = {
  beforeEach: stub(null),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_CONTEXT_TERMS.loadError),
    ).toBeVisible();
  },
};

export const BothThemes: Story = {
  beforeEach: stub(RIDE),
  globals: { theme: 'both' },
};
