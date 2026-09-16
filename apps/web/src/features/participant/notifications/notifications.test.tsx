import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  ride: { id: 'ride-1', title: 'Утренний гравийный заезд' },
  message: null,
  createdAt: '2027-01-02T00:00:00.000Z',
  readAt: null,
};

const rideUpdate: Notification = {
  id: 'notif-2',
  userId: 'user-1',
  type: 'ride_update',
  ride: { id: 'ride-2', title: 'Вечерний заезд' },
  message: 'Старт перенесён на 9:00.',
  createdAt: '2027-01-03T00:00:00.000Z',
  readAt: '2027-01-03T01:00:00.000Z',
};

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
    expect(screen.getByText('Старт перенесён на 9:00.')).toBeInTheDocument();
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
});
