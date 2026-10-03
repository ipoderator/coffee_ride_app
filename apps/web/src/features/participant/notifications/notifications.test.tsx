import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Notification } from 'types';
import { NotificationList } from './components/NotificationList';
import { listMyNotifications, markNotificationRead } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listMyNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
  };
});

const listMyNotificationsMock = vi.mocked(listMyNotifications);
const markNotificationReadMock = vi.mocked(markNotificationRead);

const registrationConfirmed: Notification = {
  id: 'notif-1',
  userId: 'user-1',
  type: 'registration_confirmed',
  ride: {
    id: 'ride-1',
    title: 'Утренний гравийный заезд',
    startTimezone: 'Europe/Moscow',
  },
  message: null,
  createdAt: '2027-01-02T00:00:00.000Z',
  readAt: null,
  reschedule: null,
};

const rideUpdate: Notification = {
  id: 'notif-2',
  userId: 'user-1',
  type: 'ride_update',
  ride: {
    id: 'ride-2',
    title: 'Вечерний заезд',
    startTimezone: 'Europe/Moscow',
  },
  message: 'Встречаемся у южного входа.',
  createdAt: '2027-01-03T00:00:00.000Z',
  readAt: '2027-01-03T01:00:00.000Z',
  reschedule: null,
};

/** The card's own timestamp line (`<p>` holding `date time`). */
function timestampLine(text: string) {
  return screen.queryByText(
    (_, element) => element?.tagName === 'P' && element.textContent === text,
  );
}

describe('NotificationList', () => {
  beforeEach(() => {
    listMyNotificationsMock.mockReset();
    markNotificationReadMock.mockReset();
  });

  it('shows an empty state when there are no notifications', async () => {
    listMyNotificationsMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<NotificationList />);

    expect(await screen.findByText('Пока нет уведомлений')).toBeInTheDocument();
  });

  it('shows an error state on a network/server failure', async () => {
    listMyNotificationsMock.mockRejectedValue(new Error('network error'));

    render(<NotificationList />);

    expect(
      await screen.findByText(
        'Не удалось загрузить уведомления. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the type label, ride title, and an unread badge for an unread item', async () => {
    listMyNotificationsMock.mockResolvedValue({
      items: [registrationConfirmed],
      nextCursor: null,
    });

    render(<NotificationList />);

    expect(
      await screen.findByText('Регистрация подтверждена'),
    ).toBeInTheDocument();
    expect(screen.getByText('Утренний гравийный заезд')).toBeInTheDocument();
    expect(screen.getByText('Новое')).toBeInTheDocument();
  });

  it('renders the update message and no unread badge for a read item', async () => {
    listMyNotificationsMock.mockResolvedValue({
      items: [rideUpdate],
      nextCursor: null,
    });

    render(<NotificationList />);

    expect(await screen.findByText('Обновление по заезду')).toBeInTheDocument();
    expect(screen.getByText('Встречаемся у южного входа.')).toBeInTheDocument();
    expect(screen.queryByText('Новое')).not.toBeInTheDocument();
  });

  it('links each card into the ride detail page and marks an unread one read on click', async () => {
    listMyNotificationsMock.mockResolvedValue({
      items: [registrationConfirmed],
      nextCursor: null,
    });
    markNotificationReadMock.mockResolvedValue({
      notification: {
        ...registrationConfirmed,
        readAt: '2027-01-02T01:00:00.000Z',
      },
    });

    render(<NotificationList />);
    const link = (await screen.findByText('Утренний гравийный заезд')).closest(
      'a',
    );
    expect(link).toHaveAttribute('href', '/rides/ride-1');

    fireEvent.click(link!);

    expect(markNotificationReadMock).toHaveBeenCalledWith('notif-1');
  });

  // CR-199: the card read `createdAt` in UTC while the organizer's journal
  // reads it in the ride's zone — the same update showed 13:01 vs 16:01.
  describe('timestamp in the ride timezone', () => {
    beforeEach(() => {
      // Same year as the fixtures, so `formatDate` omits the year.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2027-01-10T12:00:00.000Z'));
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows a Europe/Moscow ride update in MSK, not UTC', async () => {
      listMyNotificationsMock.mockResolvedValue({
        items: [{ ...rideUpdate, createdAt: '2027-01-03T13:01:00.000Z' }],
        nextCursor: null,
      });

      render(<NotificationList />);

      await screen.findByText('Обновление по заезду');
      expect(timestampLine('3 января 16:01')).toBeInTheDocument();
      expect(timestampLine('3 января 13:01')).not.toBeInTheDocument();
    });

    it("shows the ride zone's date when it differs from the UTC date", async () => {
      listMyNotificationsMock.mockResolvedValue({
        // 22:30 UTC on 4 January is already 01:30 on 5 January in Moscow.
        items: [{ ...rideUpdate, createdAt: '2027-01-04T22:30:00.000Z' }],
        nextCursor: null,
      });

      render(<NotificationList />);

      await screen.findByText('Обновление по заезду');
      expect(timestampLine('5 января 01:30')).toBeInTheDocument();
      expect(timestampLine('4 января 22:30')).not.toBeInTheDocument();
    });

    it("reads each card in its own ride's zone, not a fixed one", async () => {
      listMyNotificationsMock.mockResolvedValue({
        items: [
          {
            ...registrationConfirmed,
            ride: {
              ...registrationConfirmed.ride,
              startTimezone: 'Asia/Yekaterinburg',
            },
            createdAt: '2027-01-03T13:01:00.000Z',
          },
          { ...rideUpdate, createdAt: '2027-01-03T13:01:00.000Z' },
        ],
        nextCursor: null,
      });

      render(<NotificationList />);

      await screen.findByText('Обновление по заезду');
      expect(timestampLine('3 января 18:01')).toBeInTheDocument();
      expect(timestampLine('3 января 16:01')).toBeInTheDocument();
    });

    it('keeps every notification type rendering in one feed', async () => {
      listMyNotificationsMock.mockResolvedValue({
        items: [
          { ...registrationConfirmed, createdAt: '2027-01-05T06:00:00.000Z' },
          {
            ...rideUpdate,
            id: 'notif-3',
            type: 'ride_cancelled',
            message: null,
            createdAt: '2027-01-05T07:00:00.000Z',
          },
          {
            ...rideUpdate,
            id: 'notif-4',
            message: 'Ждём дождь.',
            createdAt: '2027-01-05T08:00:00.000Z',
            reschedule: {
              previousStartsAt: '2027-01-08T05:00:00.000Z',
              startsAt: '2027-01-09T05:00:00.000Z',
              startTimezone: 'Europe/Moscow',
            },
          },
        ],
        nextCursor: null,
      });

      render(<NotificationList />);

      expect(
        await screen.findByText('Регистрация подтверждена'),
      ).toBeInTheDocument();
      expect(screen.getByText('Заезд отменён')).toBeInTheDocument();
      expect(screen.getByText('Заезд перенесён')).toBeInTheDocument();
      expect(screen.getByTestId('notification-reschedule')).toHaveTextContent(
        'Было: пт 8 января · 08:00 · МСК',
      );
      expect(screen.getByText('Причина: Ждём дождь.')).toBeInTheDocument();
      expect(timestampLine('5 января 09:00')).toBeInTheDocument();
      expect(timestampLine('5 января 10:00')).toBeInTheDocument();
      expect(timestampLine('5 января 11:00')).toBeInTheDocument();
    });
  });
});
