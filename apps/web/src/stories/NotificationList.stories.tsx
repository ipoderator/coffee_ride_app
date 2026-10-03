import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { expect } from 'storybook/test';
import type { ListMyNotificationsResponse, Notification } from 'types';
import { NOTIFICATIONS_TERMS } from 'ui';
import { NotificationList } from '@/features/participant/notifications/components/NotificationList';

// `/me/notifications` (CR-041) with `GET /api/v1/notifications/mine` stubbed,
// so loading / error / empty are the list's real states. CR-199: each card's
// time is read in its ride's own zone — 13:01 UTC shows as 16:01 for Moscow.

const MOSCOW_RIDE = {
  id: 'ride-1',
  title: 'Утренний гравийный заезд',
  startTimezone: 'Europe/Moscow',
};

const FEED: Notification[] = [
  {
    id: 'notif-1',
    userId: 'user-1',
    type: 'ride_update',
    ride: MOSCOW_RIDE,
    message: 'Встречаемся у южного входа.',
    createdAt: '2027-01-03T13:01:00.000Z',
    readAt: null,
    reschedule: null,
  },
  {
    id: 'notif-2',
    userId: 'user-1',
    type: 'ride_update',
    ride: MOSCOW_RIDE,
    message: 'Ждём дождь.',
    createdAt: '2027-01-02T09:00:00.000Z',
    readAt: '2027-01-02T10:00:00.000Z',
    reschedule: {
      previousStartsAt: '2027-01-08T05:00:00.000Z',
      startsAt: '2027-01-09T05:00:00.000Z',
      startTimezone: 'Europe/Moscow',
    },
  },
  {
    id: 'notif-3',
    userId: 'user-1',
    type: 'ride_cancelled',
    ride: {
      id: 'ride-2',
      title: 'Вечерний заезд',
      startTimezone: 'Europe/Moscow',
    },
    message: null,
    createdAt: '2027-01-01T18:00:00.000Z',
    readAt: '2027-01-01T19:00:00.000Z',
    reschedule: null,
  },
  {
    id: 'notif-4',
    userId: 'user-1',
    type: 'registration_confirmed',
    ride: MOSCOW_RIDE,
    message: null,
    createdAt: '2026-12-30T21:30:00.000Z',
    readAt: '2026-12-31T08:00:00.000Z',
    reschedule: null,
  },
];

function stubNotifications(respond: () => Promise<Response>) {
  return () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);
      if (url.pathname === '/api/v1/notifications/mine') return respond();
      return original(input, init);
    };
    return () => {
      globalThis.fetch = original;
    };
  };
}

function json(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

const feed = (): Promise<Response> =>
  json({ items: FEED, nextCursor: null } satisfies ListMyNotificationsResponse);

const meta = {
  title: 'Participant/NotificationList',
  component: NotificationList,
  tags: ['autodocs'],
  beforeEach: stubNotifications(feed),
} satisfies Meta<typeof NotificationList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Feed: Story = {
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText('Встречаемся у южного входа.'),
    ).toBeVisible();
    // CR-199: 13:01 UTC in the ride's zone (Moscow), not UTC.
    await expect(canvas.getByText(/3 января.* 16:01$/)).toBeVisible();
    await expect(canvas.queryByText(/13:01$/)).toBeNull();
    // 21:30 UTC on 30 December is already 31 December in Moscow.
    await expect(canvas.getByText(/31 декабря.* 00:30$/)).toBeVisible();
    await expect(canvas.getByText('Заезд перенесён')).toBeVisible();
    await expect(canvas.getByText('Заезд отменён')).toBeVisible();
  },
};

export const Empty: Story = {
  beforeEach: stubNotifications(() => json({ items: [], nextCursor: null })),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(NOTIFICATIONS_TERMS.emptyTitle),
    ).toBeVisible();
  },
};

export const LoadError: Story = {
  beforeEach: stubNotifications(() =>
    json(
      { type: 'about:blank', title: 'Error', status: 500, code: 'internal' },
      500,
    ),
  ),
  play: async ({ canvas }) => {
    await expect(
      await canvas.findByText(NOTIFICATIONS_TERMS.loadError),
    ).toBeVisible();
  },
};

/** Never answers — the skeleton stays. */
export const Loading: Story = {
  beforeEach: stubNotifications(() => new Promise<Response>(() => {})),
};

export const Dark: Story = {
  globals: { theme: 'dark' },
  play: Feed.play,
};
