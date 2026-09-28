import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRideListItem } from 'types';
import { listPublicRides } from '../api';
import { RideGrid } from './RideGrid';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return { ...actual, listPublicRides: vi.fn() };
});

const listPublicRidesMock = vi.mocked(listPublicRides);

function makeRide(
  id: string,
  overrides: Partial<PublicRideListItem> = {},
): PublicRideListItem {
  return {
    id,
    organizerId: 'org-1',
    title: `Заезд ${id}`,
    description: null,
    coverImageUrl: null,
    bicycleType: 'road',
    startsAt: '2026-10-04T06:00:00.000Z',
    startTimezone: 'Europe/Moscow',
    startLat: null,
    startLng: null,
    participantLimit: 20,
    priceRub: null,
    distanceKm: 69.5,
    elevationGainMeters: 350,
    paceKmh: 30,
    durationMinutes: null,
    difficulty: null,
    participantsVisible: true,
    status: 'registration_open',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    updatedBy: null,
    organizer: {
      id: 'org-1',
      name: 'Тестовый организатор',
      avatarUrl: null,
      rating: null,
      reviewCount: 0,
    },
    registrationsCount: 13,
    startLabel: 'Велотрек Крылатское',
    routePreview: null,
    groups: [],
    waitlistCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  listPublicRidesMock.mockReset();
});

describe('RideGrid (CR-153)', () => {
  it('features the soonest open ride, lists the rest under «Все заезды» and shows the total', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [
        makeRide('a', { status: 'registration_closed' }),
        makeRide('b'),
        makeRide('c'),
      ],
      nextCursor: null,
      total: 3,
    });

    render(<RideGrid />);

    const featured = await screen.findByRole('article', { name: 'Заезд b' });
    expect(within(featured).getByText('Ближайший')).toBeInTheDocument();
    expect(
      within(featured).getByText('Старт: Велотрек Крылатское'),
    ).toBeInTheDocument();
    expect(
      within(featured).getByText('13 из 20 участников'),
    ).toBeInTheDocument();
    expect(
      within(featured).getByRole('link', {
        name: 'Подробнее и запись: Заезд b',
      }),
    ).toHaveAttribute('href', '/rides/b');

    const all = screen.getByRole('region', { name: 'Все заезды' });
    const cards = within(all)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(cards).toEqual(['/rides/a', '/rides/c']);
    expect(screen.getByText('3 заезда')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Групповые велозаезды с кофе. Выбирайте по темпу, покрытию и свободным местам.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Показать ещё/ })).toBeNull();
  });

  it('reloads the first page when a chip changes', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [makeRide('a'), makeRide('b')],
      nextCursor: null,
      total: 2,
    });

    render(<RideGrid />);
    await screen.findByRole('article', { name: 'Заезд a' });
    fireEvent.click(screen.getByRole('button', { name: 'Бесплатные' }));
    await waitFor(() => expect(listPublicRidesMock).toHaveBeenCalledTimes(2));
    expect(listPublicRidesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ free: true }),
    );
    expect(listPublicRidesMock.mock.lastCall?.[0]).not.toHaveProperty('cursor');
  });

  it('pages with «Показать ещё N заездов» and keeps the query', async () => {
    listPublicRidesMock
      .mockResolvedValueOnce({
        items: [makeRide('a'), makeRide('b')],
        nextCursor: 'cursor-2',
        total: 5,
      })
      .mockResolvedValueOnce({
        items: [makeRide('c'), makeRide('d'), makeRide('e')],
        nextCursor: null,
        total: 5,
      });

    render(<RideGrid />);
    const more = await screen.findByRole('button', {
      name: 'Показать ещё 3 заезда',
    });
    fireEvent.click(more);

    await screen.findByText('Заезд e');
    expect(listPublicRidesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ cursor: 'cursor-2' }),
    );
    expect(screen.queryByRole('button', { name: /Показать ещё/ })).toBeNull();
    // The featured ride stays the first page's pick.
    expect(
      screen.getByRole('article', { name: 'Заезд a' }),
    ).toBeInTheDocument();
  });

  it('keeps the loaded rides and offers a retry when the next page fails', async () => {
    listPublicRidesMock
      .mockResolvedValueOnce({
        items: [makeRide('a'), makeRide('b')],
        nextCursor: 'cursor-2',
        total: 3,
      })
      .mockRejectedValueOnce(new Error('network'));

    render(<RideGrid />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Показать ещё 1 заезд' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось загрузить ещё заезды',
    );
    expect(screen.getByText('Заезд b')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Показать ещё 1 заезд' }),
    ).toBeEnabled();
  });

  it('sends each chip to the API and resets them from the filtered empty state', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });

    render(<RideGrid />);
    await screen.findByText('Пока нет заездов');

    fireEvent.change(screen.getByLabelText('Темп'), {
      target: { value: 'from20to25' },
    });
    fireEvent.change(screen.getByLabelText('Сложность'), {
      target: { value: '2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Эта неделя' }));

    await waitFor(() =>
      expect(listPublicRidesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          paceMin: 20,
          paceMax: 25,
          difficulty: 2,
          startsTo: expect.any(String),
        }),
      ),
    );
    expect(screen.getByRole('button', { name: 'Эта неделя' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(
      await screen.findByRole('button', { name: 'Сбросить фильтры' }),
    );
    await screen.findByText('Пока нет заездов');
    expect(screen.getByLabelText('Темп')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Эта неделя' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
