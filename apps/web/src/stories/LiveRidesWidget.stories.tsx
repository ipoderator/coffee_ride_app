import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { ORGANIZER_LIVE_TERMS } from 'ui';
import { LiveRidesWidget } from '@/features/organizer/live-rides/components/LiveRidesWidget';

// `/organizer`'s «Заезды сейчас» + «Ближайшие заезды» (`LiveRidesWidget`),
// with `GET /api/v1/rides/mine` and `/participants` stubbed per story.

const LIVE = {
  id: 'live-1',
  title: 'Гравийный круг по Серебряному бору',
  status: 'started',
  startsAt: '2026-10-02T06:00:00Z',
  startTimezone: 'Europe/Moscow',
  distanceKm: 69,
};
const NEXT = {
  id: 'next-1',
  title: 'Кофейный круг по набережным',
  status: 'registration_open',
  startsAt: '2099-01-03T07:00:00Z',
  startTimezone: 'Europe/Moscow',
  distanceKm: 40,
};
const PEOPLE = [
  {
    id: 'p1',
    userId: 'u1',
    displayName: 'Алексей Козлов',
    createdAt: '2026-09-30T06:00:00Z',
    group: null,
    finishClaimedAt: '2026-10-02T09:26:00Z',
    attendance: null,
  },
  {
    id: 'p2',
    userId: 'u2',
    displayName: 'Мария Романова',
    createdAt: '2026-09-30T06:00:00Z',
    group: null,
    finishClaimedAt: null,
    attendance: null,
  },
  {
    id: 'p3',
    userId: 'u3',
    displayName: 'Илья Волков',
    createdAt: '2026-09-30T06:00:00Z',
    group: null,
    finishClaimedAt: '2026-10-02T09:18:00Z',
    attendance: 'finished',
  },
];

function stub(rides: unknown[], error = false) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const { pathname } = new URL(raw, window.location.href);
      const respond = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        });
      if (pathname === '/api/v1/rides/mine') {
        return error
          ? respond({ status: 500, code: 'internal_error' }, 500)
          : respond({ items: rides, nextCursor: null });
      }
      if (pathname.endsWith('/participants')) {
        return respond({ items: PEOPLE, nextCursor: null });
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

const meta = {
  title: 'Organizer/LiveRidesWidget',
  component: LiveRidesWidget,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof LiveRidesWidget>;
export default meta;
type Story = StoryObj<typeof meta>;

/** A ride under way with a claim to confirm, plus the next published ride. */
export const LiveAndUpcoming: Story = {
  beforeEach: stub([LIVE, NEXT]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(LIVE.title)).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: ORGANIZER_LIVE_TERMS.confirm }),
    ).toBeVisible();
    await expect(canvas.getByText(NEXT.title)).toBeVisible();
  },
};

export const UpcomingOnly: Story = {
  beforeEach: stub([NEXT]),
  play: async ({ canvas }) => {
    await expect(await canvas.findByText(NEXT.title)).toBeVisible();
  },
};

export const LoadError: Story = {
  beforeEach: stub([], true),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ORGANIZER_LIVE_TERMS.loadError),
    ).toBeVisible();
  },
};
