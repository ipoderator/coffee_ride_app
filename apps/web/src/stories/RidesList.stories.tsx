import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { RIDE_LIST_TERMS } from 'ui';
import { RidesList } from '@/features/organizer/rides/components/RidesList';

// `/organizer/rides` («Мои заезды», `RidesList`): the organizer's rides grouped
// by status, `GET /api/v1/rides/mine` stubbed per story. CR-184 marks a ride
// whose start passed while it is still before `started` («Требует решения»).

const BASE = {
  organizerId: 'org-1',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startTimezone: 'Europe/Moscow',
  startLat: null,
  startLng: null,
  participantLimit: 20,
  priceRub: null,
  distanceKm: 42,
  elevationGainMeters: null,
  paceKmh: null,
  durationMinutes: null,
  difficulty: null,
  participantsVisible: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  updatedBy: 'user-1',
};

const DRAFT = {
  ...BASE,
  id: 'ride-draft',
  title: 'Кофейный круг по набережным',
  status: 'draft',
  startsAt: '2099-10-10T06:00:00.000Z',
};
const OPEN = {
  ...BASE,
  id: 'ride-open',
  title: 'Гравийный круг по Серебряному бору',
  status: 'registration_open',
  startsAt: '2099-10-05T06:00:00.000Z',
};
const OVERDUE = {
  ...BASE,
  id: 'ride-late',
  title: 'Утро на Лосином острове',
  status: 'registration_open',
  startsAt: '2026-10-01T05:00:00.000Z',
};
const FINISHED = {
  ...BASE,
  id: 'ride-done',
  title: 'Осенний гранфондо',
  status: 'finished',
  startsAt: '2026-09-20T05:00:00.000Z',
};

function stub(items: unknown[], error = false) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(raw, window.location.href);
      if (pathname === '/api/v1/rides/mine') {
        return new Response(
          JSON.stringify(
            error
              ? { status: 500, code: 'internal_error' }
              : { items, nextCursor: null },
          ),
          {
            status: error ? 500 : 200,
            headers: { 'content-type': 'application/json' },
          },
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
  title: 'Organizer/RidesList',
  component: RidesList,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof RidesList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Rides in several statuses, nothing overdue. */
export const Grouped: Story = {
  beforeEach: stub([DRAFT, OPEN, FINISHED]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(OPEN.title)).toBeVisible();
    await expect(
      canvas.queryByText(RIDE_LIST_TERMS.overdueBadge),
    ).not.toBeInTheDocument();
  },
};

/** A ride still «Регистрация открыта» after its start time: marked. */
export const NeedsDecision: Story = {
  beforeEach: stub([OVERDUE, OPEN, FINISHED]),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_LIST_TERMS.overdueBadge),
    ).toBeVisible();
    await expect(canvas.getByText(RIDE_LIST_TERMS.overdueHint)).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: stub([]),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_LIST_TERMS.emptyTitle),
    ).toBeVisible();
  },
};

export const LoadError: Story = {
  beforeEach: stub([], true),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(RIDE_LIST_TERMS.loadError),
    ).toBeVisible();
  },
};
