import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  OrganizerActivityRegistration,
  OrganizerRegistrationActivity,
} from 'types';
import { ApiError } from '@/lib/api/errors';
import { getRegistrationActivity } from './api';
import { RegistrationActivityWidget } from './components/RegistrationActivityWidget';
import { currentWeek, toActivityEntry, withCounts } from './lib/activity';

vi.mock('./api', () => ({ getRegistrationActivity: vi.fn() }));

const getActivityMock = vi.mocked(getRegistrationActivity);

// Saturday 26 September; the week is 21–27 September.
const NOW = new Date('2026-09-26T12:00:00Z');

function registration(
  id: string,
  createdAt: string,
  overrides: Partial<OrganizerActivityRegistration> = {},
): OrganizerActivityRegistration {
  return {
    id,
    rideId: 'ride-1',
    rideTitle: 'Рассветный интервальный',
    displayName: `Участник ${id}`,
    group: null,
    createdAt,
    ...overrides,
  };
}

function activity(
  recent: OrganizerActivityRegistration[],
  counts: Record<string, number> = {},
): { activity: OrganizerRegistrationActivity } {
  return {
    activity: {
      recent,
      days: Object.entries(counts).map(([date, count]) => ({ date, count })),
    },
  };
}

describe('currentWeek / withCounts', () => {
  it('covers the calendar week пн–вс, today flagged (CR-131)', () => {
    const week = currentWeek(NOW, 'UTC');
    expect(week.map((d) => d.weekday)).toEqual([
      'пн',
      'вт',
      'ср',
      'чт',
      'пт',
      'сб',
      'вс',
    ]);
    expect(week[0]!.key).toBe('2026-09-21');
    expect(week[5]).toMatchObject({ key: '2026-09-26', isToday: true });
  });

  it("starts the week in the viewer's zone", () => {
    // 22:30 UTC on Sunday the 27th is already Monday the 28th in Moscow.
    const late = new Date('2026-09-27T22:30:00Z');
    expect(currentWeek(late, 'UTC')[0]!.key).toBe('2026-09-21');
    expect(currentWeek(late, 'Europe/Moscow')[0]!.key).toBe('2026-09-28');
  });

  it('fills counts by date and flags one peak, none on an empty week', () => {
    const week = currentWeek(NOW, 'UTC');
    const days = withCounts(week, [
      { date: '2026-09-24', count: 1 },
      { date: '2026-09-26', count: 2 },
    ]);
    expect(days.map((d) => d.count)).toEqual([0, 0, 0, 1, 0, 2, 0]);
    expect(days[5]).toMatchObject({ isToday: true, isPeak: true });
    expect(days.filter((d) => d.isPeak)).toHaveLength(1);
    expect(withCounts(week, []).some((d) => d.isPeak)).toBe(false);
  });

  it('keeps only the group name of a registration', () => {
    expect(
      toActivityEntry(
        registration('a', '2026-09-26T09:00:00Z', {
          group: { id: 'g1', name: 'Группа 1', paceKmh: 25 },
        }),
      ),
    ).toMatchObject({ id: 'a', rideId: 'ride-1', groupName: 'Группа 1' });
  });
});

describe('RegistrationActivityWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    getActivityMock.mockReset();
  });

  it('reads one aggregate for the week and shows the newest registrations', async () => {
    getActivityMock.mockResolvedValue(
      activity(
        [
          registration('a', '2026-09-26T11:52:00Z', {
            displayName: 'Анна Кузнецова',
            group: { id: 'g1', name: 'Группа 1', paceKmh: 25 },
          }),
          registration('b', '2026-09-26T10:00:00Z', { displayName: null }),
        ],
        { '2026-09-26': 2 },
      ),
    );

    render(<RegistrationActivityWidget />);

    // CR-149: the name opens that rider's profile card.
    expect(
      (await screen.findByRole('link', { name: 'Анна К.' })).getAttribute(
        'href',
      ),
    ).toBe('/rides/ride-1/riders/a?from=overview');
    expect(screen.getByText('· Группа 1')).toBeTruthy();
    expect(screen.getByText('8 мин')).toBeTruthy();
    expect(screen.getByText('Без имени')).toBeTruthy();
    expect(screen.getByText('сегодня: 2 записи')).toBeTruthy();
    // CR-132: one ride in the feed — rows don't repeat its title.
    expect(screen.queryByText(/Рассветный интервальный/)).toBeNull();
    expect(getActivityMock).toHaveBeenCalledTimes(1);
    expect(getActivityMock).toHaveBeenCalledWith({
      from: currentWeek(
        NOW,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      )[0]!.key,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it('names the ride on each row once the feed spans several rides (CR-132)', async () => {
    getActivityMock.mockResolvedValue(
      activity([
        registration('a', '2026-09-26T11:52:00Z'),
        registration('b', '2026-09-26T11:00:00Z', {
          rideId: 'ride-2',
          rideTitle: 'Вечерний',
        }),
      ]),
    );

    render(<RegistrationActivityWidget />);

    expect(await screen.findByText('· Рассветный интервальный')).toBeTruthy();
    expect(screen.getByText('· Вечерний')).toBeTruthy();
  });

  it('shows the empty copy when nobody has registered', async () => {
    getActivityMock.mockResolvedValue(activity([]));
    render(<RegistrationActivityWidget />);
    expect(
      await screen.findByText('На ближайшие заезды пока никто не записался.'),
    ).toBeTruthy();
  });

  it('shows an error with retry, and recovers', async () => {
    getActivityMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        title: 'Internal Server Error',
        status: 500,
        detail: 'Something went wrong.',
        instance: '/v1/rides/mine/registrations/activity',
        code: 'internal_error',
      }),
    );
    getActivityMock.mockResolvedValueOnce(activity([]));

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
