import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride, RideParticipantSummary } from 'types';
import { ApiError } from '@/lib/api/errors';
import {
  listAllRideParticipants,
  listOwnRidesPage,
} from '@/lib/organizer/own-rides';
import { RegistrationActivityWidget } from './components/RegistrationActivityWidget';
import {
  MAX_ACTIVITY_RIDES,
  recentEntries,
  registrationsPerDay,
  selectActivityRides,
  toActivityEntries,
} from './lib/activity';

vi.mock('@/lib/organizer/own-rides', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/organizer/own-rides')
  >('@/lib/organizer/own-rides');
  return {
    ...actual,
    listOwnRidesPage: vi.fn(),
    listAllRideParticipants: vi.fn(),
  };
});

const listOwnRidesMock = vi.mocked(listOwnRidesPage);
const listAllRideParticipantsMock = vi.mocked(listAllRideParticipants);

const NOW = new Date('2026-09-26T12:00:00Z');

function ride(overrides: Partial<Ride> = {}): Ride {
  return {
    id: 'ride-1',
    organizerId: 'org-1',
    title: 'Рассветный интервальный',
    description: null,
    coverImageUrl: null,
    bicycleType: 'road',
    startsAt: '2026-10-04T06:00:00.000Z',
    startTimezone: 'Europe/Moscow',
    startLat: null,
    startLng: null,
    participantLimit: 20,
    priceRub: null,
    distanceKm: null,
    elevationGainMeters: null,
    paceKmh: null,
    durationMinutes: null,
    difficulty: null,
    participantsVisible: true,
    status: 'registration_open',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    updatedBy: null,
    ...overrides,
  };
}

function participant(
  id: string,
  createdAt: string,
  overrides: Partial<RideParticipantSummary> = {},
): RideParticipantSummary {
  return {
    id,
    userId: `user-${id}`,
    displayName: `Участник ${id}`,
    createdAt,
    group: null,
    ...overrides,
  };
}

describe('selectActivityRides', () => {
  it('drops drafts, cancelled and long-past rides; soonest first', () => {
    const rides = [
      ride({ id: 'later', startsAt: '2026-10-10T06:00:00Z' }),
      ride({ id: 'draft', status: 'draft' }),
      ride({ id: 'cancelled', status: 'cancelled' }),
      ride({ id: 'old', status: 'finished', startsAt: '2026-09-10T06:00:00Z' }),
      ride({
        id: 'recent',
        status: 'finished',
        startsAt: '2026-09-22T06:00:00Z',
      }),
      ride({ id: 'soon', startsAt: '2026-09-28T06:00:00Z' }),
    ];
    expect(selectActivityRides(rides, NOW).map((r) => r.id)).toEqual([
      'recent',
      'soon',
      'later',
    ]);
  });

  it(`caps at ${MAX_ACTIVITY_RIDES} rides`, () => {
    const rides = Array.from({ length: MAX_ACTIVITY_RIDES + 5 }, (_, i) =>
      ride({ id: `r${i}` }),
    );
    expect(selectActivityRides(rides, NOW)).toHaveLength(MAX_ACTIVITY_RIDES);
  });
});

describe('registrationsPerDay / recentEntries', () => {
  const entries = toActivityEntries(ride(), [
    participant('a', '2026-09-26T09:00:00Z'),
    participant('b', '2026-09-26T11:50:00Z'),
    participant('c', '2026-09-24T10:00:00Z'),
    // Before this week — ignored by the chart.
    participant('d', '2026-09-10T10:00:00Z'),
  ]);

  it('covers the calendar week пн–вс, future days kept at zero (CR-131)', () => {
    // NOW is Saturday 26 September; the week is 21–27 September.
    const days = registrationsPerDay(entries, NOW, 'UTC');
    expect(days.map((d) => d.weekday)).toEqual([
      'пн',
      'вт',
      'ср',
      'чт',
      'пт',
      'сб',
      'вс',
    ]);
    expect(days.map((d) => d.count)).toEqual([0, 0, 0, 1, 0, 2, 0]);
    expect(days[5]).toMatchObject({ isToday: true, isPeak: true });
    expect(days.filter((d) => d.isPeak)).toHaveLength(1);
  });

  it('flags no peak on an empty week', () => {
    expect(registrationsPerDay([], NOW, 'UTC').some((d) => d.isPeak)).toBe(
      false,
    );
  });

  it('uses the given zone for the day boundary', () => {
    // 22:30 UTC on Friday the 25th is already Saturday the 26th in Moscow.
    const late = toActivityEntries(ride(), [
      participant('x', '2026-09-25T22:30:00Z'),
    ]);
    expect(registrationsPerDay(late, NOW, 'Europe/Moscow')[5]?.count).toBe(1);
    expect(registrationsPerDay(late, NOW, 'UTC')[4]?.count).toBe(1);
  });

  it('lists newest first, limited', () => {
    expect(recentEntries(entries, 2).map((e) => e.id)).toEqual(['b', 'a']);
  });
});

describe('RegistrationActivityWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    listOwnRidesMock.mockReset();
    listAllRideParticipantsMock.mockReset();
  });

  it('shows the newest registrations with group and elapsed time', async () => {
    listOwnRidesMock.mockResolvedValue([ride()]);
    listAllRideParticipantsMock.mockResolvedValue([
      participant('a', '2026-09-26T11:52:00Z', {
        displayName: 'Анна Кузнецова',
        group: { id: 'g1', name: 'Группа 1', paceKmh: 25 },
      }),
      participant('b', '2026-09-26T10:00:00Z', { displayName: null }),
    ]);

    render(<RegistrationActivityWidget />);

    expect(await screen.findByText('Анна К.')).toBeTruthy();
    expect(screen.getByText('· Группа 1')).toBeTruthy();
    expect(screen.getByText('8 мин')).toBeTruthy();
    expect(screen.getByText('Без имени')).toBeTruthy();
    expect(screen.getByText('сегодня: 2 записи')).toBeTruthy();
    // CR-132: one ride in the feed — rows don't repeat its title.
    expect(screen.queryByText(/Рассветный интервальный/)).toBeNull();
    expect(listAllRideParticipantsMock).toHaveBeenCalledWith('ride-1');
  });

  it('names the ride on each row once the feed spans several rides (CR-132)', async () => {
    listOwnRidesMock.mockResolvedValue([
      ride(),
      ride({
        id: 'ride-2',
        title: 'Вечерний',
        startsAt: '2026-10-05T15:00:00.000Z',
      }),
    ]);
    listAllRideParticipantsMock.mockImplementation(async (rideId) =>
      rideId === 'ride-1'
        ? [participant('a', '2026-09-26T11:52:00Z')]
        : [participant('b', '2026-09-26T11:00:00Z')],
    );

    render(<RegistrationActivityWidget />);

    expect(await screen.findByText('· Рассветный интервальный')).toBeTruthy();
    expect(screen.getByText('· Вечерний')).toBeTruthy();
  });

  it('shows the empty copy when nobody has registered', async () => {
    listOwnRidesMock.mockResolvedValue([]);
    render(<RegistrationActivityWidget />);
    expect(
      await screen.findByText('На ближайшие заезды пока никто не записался.'),
    ).toBeTruthy();
    expect(listAllRideParticipantsMock).not.toHaveBeenCalled();
  });

  it('shows an error with retry, and recovers', async () => {
    listOwnRidesMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Something went wrong.',
        instance: '/v1/rides/mine',
        code: 'internal_error',
      }),
    );
    listOwnRidesMock.mockResolvedValueOnce([]);

    render(<RegistrationActivityWidget />);

    expect(
      await screen.findByText('Не удалось загрузить записи на заезды.'),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(
        screen.getByText('На ближайшие заезды пока никто не записался.'),
      ).toBeTruthy(),
    );
  });
});
