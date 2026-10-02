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
  // CR-184: the bar has a segment for every outcome, no-shows included.
  {
    id: 'p4',
    userId: 'u4',
    displayName: 'Ольга Смирнова',
    createdAt: '2026-09-30T06:00:00Z',
    group: null,
    finishClaimedAt: null,
    attendance: 'dnf',
  },
  {
    id: 'p5',
    userId: 'u5',
    displayName: 'Павел Орлов',
    createdAt: '2026-09-30T06:00:00Z',
    group: null,
    finishClaimedAt: null,
    attendance: 'no_show',
  },
];
// CR-184: start passed, still `registration_open` — «Требует решения».
const OVERDUE = {
  id: 'late-1',
  title: 'Утро на Лосином острове',
  status: 'registration_open',
  startsAt: '2026-10-01T05:00:00Z',
  startTimezone: 'Europe/Moscow',
  distanceKm: 35,
};

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

/** A ride whose start passed without being started, below the live one
 * (CR-185: the started ride is the first working block). */
export const NeedsDecision: Story = {
  beforeEach: stub([OVERDUE, LIVE]),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ORGANIZER_LIVE_TERMS.attentionTitle),
    ).toBeVisible();
    await expect(canvas.getByText(OVERDUE.title)).toBeVisible();
    await expect(
      canvas.getByText(ORGANIZER_LIVE_TERMS.legendNoShow),
    ).toBeVisible();
    await expect(
      canvas.getByText(ORGANIZER_LIVE_TERMS.resolvedOf(3, 5)),
    ).toBeVisible();
  },
};

/** CR-185: a phone-width column with long titles — they wrap (two lines
 * at most), the date and action drop to their own line, nothing overflows. */
export const LongTitlesOnAPhone: Story = {
  beforeEach: stub([
    OVERDUE,
    {
      ...NEXT,
      title:
        'Большой гравийный марафон по Подмосковью через Звенигород и Рузу с остановкой на кофе',
    },
  ]),
  decorators: [
    (Story) => (
      <div data-testid="phone-column" className="w-[358px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(/Большой гравийный марафон/),
    ).toBeVisible();
    const column = canvas.getByTestId('phone-column');
    await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth);
    for (const link of canvas.getAllByRole('link', { name: /→$/ })) {
      await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(
        44,
      );
    }
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
