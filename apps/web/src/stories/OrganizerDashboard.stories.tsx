import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import { ORGANIZER_LIVE_TERMS, ORGANIZER_OVERVIEW_TERMS } from 'ui';
import { LiveRidesWidget } from '@/features/organizer/live-rides/components/LiveRidesWidget';
import { OrganizerKpiWidget } from '@/features/organizer/overview/components/OrganizerKpiWidget';
import { OrganizerOverviewWidget } from '@/features/organizer/overview/components/OrganizerOverviewWidget';

// `/organizer`'s widget column in registry order (CR-185): the head, the
// rides needing work (live → needs a decision → coming up), then the KPI
// row. Every read is stubbed per story; no numbers here reach production.

const DAY = 86_400_000;
const PROFILE = {
  organizerProfile: {
    id: 'org-1',
    userId: 'u-1',
    name: 'Гравий по выходным',
    description: null,
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  rating: 4.7,
  reviewCount: 3,
};
const SUMMARY = {
  totalRides: 3,
  draftRides: 0,
  openRegistrationRides: 2,
  activeRegistrations: 6,
  waitlisted: 0,
};
const LIVE = {
  id: 'live-1',
  title: 'Гравий: круг по Серебряному бору',
  status: 'started',
  startsAt: new Date(Date.now() - 3_600_000).toISOString(),
  startTimezone: 'Europe/Moscow',
  distanceKm: 25,
  participantLimit: 15,
};
const OVERDUE = {
  id: 'late-1',
  title: 'Утро на Лосином острове',
  status: 'registration_open',
  startsAt: new Date(Date.now() - DAY).toISOString(),
  startTimezone: 'Europe/Moscow',
  distanceKm: 35,
  participantLimit: null,
};
const NEXT = {
  id: 'next-1',
  title:
    'Большой гравийный марафон по Подмосковью через Звенигород и Рузу с остановкой на кофе',
  status: 'registration_open',
  startsAt: new Date(Date.now() + 2 * DAY).toISOString(),
  startTimezone: 'Europe/Moscow',
  distanceKm: 120,
  participantLimit: 30,
};
const PEOPLE = [
  {
    id: 'p1',
    displayName: 'Алексей Козлов',
    finishClaimedAt: new Date().toISOString(),
    attendance: null,
  },
  {
    id: 'p2',
    displayName: 'Мария Романова',
    finishClaimedAt: null,
    attendance: null,
  },
  {
    id: 'p3',
    displayName: 'Илья Волков',
    finishClaimedAt: null,
    attendance: 'finished',
  },
].map((person) => ({
  ...person,
  userId: `u-${person.id}`,
  group: null,
  createdAt: new Date(Date.now() - 2 * DAY).toISOString(),
}));

function stub({
  rides = [LIVE, OVERDUE, NEXT] as unknown[],
  profile = 200,
  fail = false,
} = {}) {
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
      if (pathname === '/api/v1/organizers/me') {
        return profile === 200
          ? respond(PROFILE)
          : respond({ status: 404, code: 'organizer_profile_not_found' }, 404);
      }
      if (pathname === '/api/v1/rides/mine/summary') {
        return fail
          ? respond({ status: 500, code: 'internal_error' }, 500)
          : respond({ summary: SUMMARY });
      }
      if (pathname === '/api/v1/rides/mine') {
        return respond({ items: rides, nextCursor: null });
      }
      if (pathname.endsWith('/participants')) {
        return respond({ items: PEOPLE, nextCursor: null });
      }
      if (pathname.endsWith('/waitlist')) {
        return respond({ items: [], nextCursor: null });
      }
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

function Dashboard() {
  return (
    <div className="grid grid-cols-1 gap-4">
      <OrganizerOverviewWidget />
      <LiveRidesWidget />
      <OrganizerKpiWidget />
    </div>
  );
}

const meta = {
  title: 'Organizer/Dashboard',
  component: Dashboard,
  parameters: { layout: 'padded' },
} satisfies Meta<typeof Dashboard>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Active work above the statistics: live → needs a decision → next → KPIs. */
export const ActiveWorkFirst: Story = {
  beforeEach: stub(),
  play: async ({ canvas, canvasElement }) => {
    await expect(await canvas.findByText(LIVE.title)).toBeVisible();
    const kpi = await canvas.findByText(ORGANIZER_OVERVIEW_TERMS.waitlistLabel);
    const live = canvas.getByText(ORGANIZER_LIVE_TERMS.liveTitle);
    const attention = canvas.getByText(ORGANIZER_LIVE_TERMS.attentionTitle);
    // Document order: live, then the decision, then the KPI row.
    await expect(
      live.compareDocumentPosition(attention) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(
      attention.compareDocumentPosition(kpi) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await expect(canvasElement.scrollWidth).toBeLessThanOrEqual(
      canvasElement.clientWidth,
    );
  },
};

/** CR-185: 358 px (a 390 px phone minus gutters) with a long ride title —
 * the page used to grow to 768 px wide. */
export const PhoneWidthLongTitle: Story = {
  beforeEach: stub(),
  decorators: [
    (Story) => (
      <div data-testid="phone-column" className="w-[358px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ORGANIZER_OVERVIEW_TERMS.waitlistLabel),
    ).toBeVisible();
    const column = canvas.getByTestId('phone-column');
    await expect(column.scrollWidth).toBeLessThanOrEqual(column.clientWidth);
  },
};

export const NoProfile: Story = {
  beforeEach: stub({ rides: [], profile: 404 }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByRole('link', { name: 'Создать профиль' }),
    ).toBeVisible();
    await expect(
      canvas.queryByText(ORGANIZER_OVERVIEW_TERMS.waitlistLabel),
    ).not.toBeInTheDocument();
  },
};

export const LoadError: Story = {
  beforeEach: stub({ fail: true }),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(ORGANIZER_OVERVIEW_TERMS.loadError),
    ).toBeVisible();
  },
};
