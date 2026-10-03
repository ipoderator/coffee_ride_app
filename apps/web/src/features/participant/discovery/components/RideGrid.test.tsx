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

// CR-193: both views also read `phase=archive` («Завершённые и отменённые»).
// Those calls go to `archiveRidesMock` (an empty page unless a test says
// otherwise), so `listPublicRidesMock` keeps seeing the main list's calls only,
// minus the `phase` param itself (asserted directly where it matters).
const listPublicRidesMock = vi.fn<typeof listPublicRides>();
const archiveRidesMock = vi.fn<typeof listPublicRides>();

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
    // CR-185: featureable by default (route + start point + distance).
    startLat: 55.76,
    startLng: 37.41,
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
    startDescription: null,
    routePreview: [
      [55.76, 37.41],
      [55.77, 37.43],
    ],
    groups: [],
    waitlistCount: 0,
    ...overrides,
  };
}

beforeEach(() => {
  listPublicRidesMock.mockReset();
  archiveRidesMock.mockReset();
  archiveRidesMock.mockResolvedValue({ items: [], nextCursor: null, total: 0 });
  vi.mocked(listPublicRides).mockImplementation(({ phase, ...params } = {}) =>
    phase === 'archive' ? archiveRidesMock(params) : listPublicRidesMock(params),
  );
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

  it('shows no featured card when no ride has a route to show (CR-185)', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [
        makeRide('a', { routePreview: null }),
        makeRide('b', { startLat: null, startLng: null }),
      ],
      nextCursor: null,
      total: 2,
    });

    render(<RideGrid />);

    const all = await screen.findByRole('region', { name: 'Все заезды' });
    expect(screen.queryByText('Ближайший')).toBeNull();
    expect(
      within(all)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/rides/a', '/rides/b']);
  });

  // KI-060 (CR-164): a start point labelled just «Старт» used to render
  // «Старт: Старт» on the featured card (the legend row suppressed the line
  // entirely). Both now fall back to the point's description, like ride detail.
  it('falls back to the start point description when the label is just «Старт»', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [
        makeRide('a', {
          startLabel: 'Старт',
          startDescription: 'Парковка у велотрека Крылатское.',
        }),
      ],
      nextCursor: null,
      total: 1,
    });

    render(<RideGrid />);

    const featured = await screen.findByRole('article', { name: 'Заезд a' });
    expect(
      within(featured).getByText('Старт: Парковка у велотрека Крылатское'),
    ).toBeInTheDocument();
    expect(within(featured).queryByText('Старт: Старт')).toBeNull();
  });

  // The same label with nothing to fall back to still renders no start line at
  // all, rather than the meaningless «Старт: Старт».
  it('renders no start line when neither the label nor the description says where', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [makeRide('a', { startLabel: 'Старт', startDescription: null })],
      nextCursor: null,
      total: 1,
    });

    render(<RideGrid />);

    const featured = await screen.findByRole('article', { name: 'Заезд a' });
    expect(within(featured).queryByText(/^Старт: /)).toBeNull();
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
    await screen.findByText('Рядом пока тихо');
    expect(screen.getByRole('link', { name: 'Создать заезд' })).toHaveAttribute(
      'href',
      '/organizer/rides/new',
    );

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
    await screen.findByText('Рядом пока тихо');
    expect(screen.getByLabelText('Темп')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Эта неделя' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  // CR-193 (owner QA: finished/cancelled mixed in with open rides).
  describe('«Завершённые и отменённые»', () => {
    it('asks the main list for active rides and shows no archive section when there is none', async () => {
      listPublicRidesMock.mockResolvedValue({
        items: [makeRide('a')],
        nextCursor: null,
        total: 1,
      });

      render(<RideGrid />);
      await screen.findByRole('article', { name: 'Заезд a' });
      expect(vi.mocked(listPublicRides)).toHaveBeenCalledWith(
        expect.objectContaining({ phase: 'active' }),
      );
      await waitFor(() => expect(archiveRidesMock).toHaveBeenCalledTimes(1));
      expect(
        screen.queryByRole('region', { name: 'Завершённые и отменённые' }),
      ).toBeNull();
    });

    it('lists finished and cancelled rides apart, collapsed, with their own «Показать ещё»', async () => {
      listPublicRidesMock.mockResolvedValue({
        items: [makeRide('a')],
        nextCursor: null,
        total: 1,
      });
      archiveRidesMock
        .mockResolvedValueOnce({
          items: [
            makeRide('done', { status: 'finished', registrationsCount: 4 }),
            makeRide('off', { status: 'cancelled' }),
          ],
          nextCursor: 'archive-2',
          total: 3,
        })
        .mockResolvedValueOnce({
          items: [makeRide('off-2', { status: 'cancelled' })],
          nextCursor: null,
          total: 3,
        });

      render(<RideGrid />);
      const archive = await screen.findByRole('region', {
        name: 'Завершённые и отменённые',
      });
      // The featured card is the only active ride; the total counts it alone.
      expect(screen.getByText('1 заезд')).toBeInTheDocument();
      expect(screen.queryByText('Заезд done')).toBeNull();

      const toggle = within(archive).getByRole('button', {
        name: 'Показать 3 заезда',
      });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(within(archive).queryByRole('link')).toBeNull();

      fireEvent.click(toggle);
      expect(
        within(archive)
          .getAllByRole('link')
          .map((link) => link.getAttribute('href')),
      ).toEqual(['/rides/done', '/rides/off']);
      const done = within(archive).getByRole('link', { name: /Заезд done/ });
      expect(within(done).getByText('Завершён')).toBeInTheDocument();
      expect(within(done).queryByText(/Осталось/)).toBeNull();

      fireEvent.click(
        within(archive).getByRole('button', { name: 'Показать ещё 1 заезд' }),
      );
      await within(archive).findByRole('link', { name: /Заезд off-2/ });
      expect(archiveRidesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'archive-2' }),
      );

      fireEvent.click(within(archive).getByRole('button', { name: 'Скрыть' }));
      expect(within(archive).queryByRole('link')).toBeNull();
    });

    it('applies the chips to the archive too', async () => {
      listPublicRidesMock.mockResolvedValue({
        items: [makeRide('a')],
        nextCursor: null,
        total: 1,
      });
      archiveRidesMock.mockResolvedValue({
        items: [makeRide('off', { status: 'cancelled' })],
        nextCursor: null,
        total: 1,
      });

      render(<RideGrid />);
      await screen.findByRole('region', { name: 'Завершённые и отменённые' });
      fireEvent.click(screen.getByRole('button', { name: 'Бесплатные' }));
      await waitFor(() => expect(archiveRidesMock).toHaveBeenCalledTimes(2));
      expect(archiveRidesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ free: true }),
      );
    });

    it('shows a quiet notice with retry when only the archive fails', async () => {
      listPublicRidesMock.mockResolvedValue({
        items: [makeRide('a')],
        nextCursor: null,
        total: 1,
      });
      archiveRidesMock
        .mockRejectedValueOnce(new Error('network'))
        .mockResolvedValueOnce({ items: [], nextCursor: null, total: 0 });

      render(<RideGrid />);
      const notice = await screen.findByText(
        'Не удалось загрузить завершённые и отменённые заезды.',
      );
      expect(screen.queryByRole('alert')).toBeNull();
      fireEvent.click(
        within(notice.closest('[role="status"]') as HTMLElement).getByRole(
          'button',
        ),
      );
      await waitFor(() =>
        expect(
          screen.queryByText(
            'Не удалось загрузить завершённые и отменённые заезды.',
          ),
        ).toBeNull(),
      );
      expect(archiveRidesMock).toHaveBeenCalledTimes(2);
    });

    it('says nothing about the archive when the whole list failed', async () => {
      listPublicRidesMock.mockRejectedValue(new Error('network'));
      archiveRidesMock.mockRejectedValue(new Error('network'));

      render(<RideGrid />);
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(
        screen.queryByText(
          'Не удалось загрузить завершённые и отменённые заезды.',
        ),
      ).toBeNull();
    });
  });
});
