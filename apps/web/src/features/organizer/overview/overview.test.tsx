import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizerProfileResponse, Ride } from 'types';
import {
  fetchNearestOwnRide,
  listAllRideParticipants,
  listAllRideWaitlist,
} from '@/lib/organizer/own-rides';
import { ApiError, getOwnOrganizerProfile, getOwnRideSummary } from './api';
import { OrganizerOverviewWidget } from './components/OrganizerOverviewWidget';
import { nearestRideValue, registeredValue } from './lib/overview';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getOwnOrganizerProfile: vi.fn(),
    getOwnRideSummary: vi.fn(),
  };
});
vi.mock('@/lib/organizer/own-rides', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/organizer/own-rides')
  >('@/lib/organizer/own-rides');
  return {
    ...actual,
    fetchNearestOwnRide: vi.fn(),
    listAllRideParticipants: vi.fn(),
    listAllRideWaitlist: vi.fn(),
  };
});

const profileMock = vi.mocked(getOwnOrganizerProfile);
const summaryMock = vi.mocked(getOwnRideSummary);
const nearestMock = vi.mocked(fetchNearestOwnRide);
const participantsMock = vi.mocked(listAllRideParticipants);
const waitlistMock = vi.mocked(listAllRideWaitlist);

// Local 08:00 (the test runner's own zone) on Friday 2 October 2026.
const NOW = new Date(2026, 9, 2, 8, 0);

const PROFILE: OrganizerProfileResponse = {
  organizerProfile: {
    id: 'org-1',
    userId: 'user-1',
    name: 'Тестовый организатор',
    description: null,
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as OrganizerProfileResponse['organizerProfile'],
  rating: 4.8,
  reviewCount: 32,
};

const NEAREST = {
  id: 'ride-1',
  title: 'Тестовый заезд на выходные',
  status: 'registration_open',
  // Sunday 4 October, 09:00 Moscow.
  startsAt: '2026-10-04T06:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  participantLimit: 20,
} as Ride;

function participants(count: number, recent: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i}`,
    userId: `u${i}`,
    displayName: null,
    group: null,
    createdAt: new Date(
      NOW.getTime() - (i < recent ? 3_600_000 : 5 * 86_400_000),
    ).toISOString(),
  }));
}

function cell(label: string): HTMLElement {
  return screen.getByText(label).closest('dl') as HTMLElement;
}

describe('OrganizerOverviewWidget (CR-131)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    for (const mock of [
      profileMock,
      summaryMock,
      nearestMock,
      participantsMock,
      waitlistMock,
    ])
      mock.mockReset();
    profileMock.mockResolvedValue(PROFILE);
    summaryMock.mockResolvedValue({
      summary: {
        totalRides: 3,
        draftRides: 0,
        openRegistrationRides: 2,
        activeRegistrations: 20,
        waitlisted: 4,
      },
    });
    nearestMock.mockResolvedValue(NEAREST);
    participantsMock.mockResolvedValue(participants(15, 3));
    waitlistMock.mockResolvedValue(participants(2, 0));
  });

  it('renders the mockup head and KPI cells from real data', async () => {
    render(<OrganizerOverviewWidget />);

    expect(await screen.findByText('Доброе утро')).toBeInTheDocument();
    expect(screen.getByText('Тестовый организатор')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Отправить обновление' }),
    ).toHaveAttribute('href', '/organizer/rides/ride-1/updates');

    expect(within(cell('Ближайший')).getByText('2 дн')).toBeInTheDocument();
    expect(
      within(cell('Ближайший')).getByText('вс 04.10 · 09:00'),
    ).toBeInTheDocument();
    expect(within(cell('Записано')).getByText('15/20')).toBeInTheDocument();
    expect(
      within(cell('Записано')).getByText('+3 за сутки'),
    ).toBeInTheDocument();
    // CR-132: the nearest ride's own waitlist, not the all-rides total (4).
    expect(within(cell('Лист ожидания')).getByText('2')).toBeInTheDocument();
    expect(
      within(cell('Лист ожидания')).getByText(
        'на «Тестовый заезд на выходные»',
      ),
    ).toBeInTheDocument();
    expect(within(cell('Рейтинг')).getByText('4,8')).toBeInTheDocument();
    expect(within(cell('Рейтинг')).getByText('32 отзыва')).toBeInTheDocument();
    expect(participantsMock).toHaveBeenCalledWith('ride-1');
  });

  it('degrades without a nearest ride: dashes, no update button', async () => {
    nearestMock.mockResolvedValue(null);
    render(<OrganizerOverviewWidget />);

    expect(
      await screen.findByText('Нет запланированных заездов'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Отправить обновление' }),
    ).not.toBeInTheDocument();
    expect(within(cell('Записано')).getByText('—')).toBeInTheDocument();
    // Without a nearest ride the waitlist falls back to the all-rides total.
    expect(within(cell('Лист ожидания')).getByText('4')).toBeInTheDocument();
    expect(
      within(cell('Лист ожидания')).getByText('По всем заездам'),
    ).toBeInTheDocument();
    expect(participantsMock).not.toHaveBeenCalled();
    expect(waitlistMock).not.toHaveBeenCalled();
  });

  it('offers to create a profile when there is none', async () => {
    profileMock.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'Not Found',
        status: 404,
        detail: 'No organizer profile.',
        instance: '/v1/organizers/me',
        code: 'organizer_profile_not_found',
      }),
    );
    // CR-133: the other reads start alongside the profile read; without a
    // profile their failures must not turn into the error state.
    summaryMock.mockRejectedValue(new Error('forbidden'));
    nearestMock.mockRejectedValue(new Error('forbidden'));
    render(<OrganizerOverviewWidget />);

    expect(
      await screen.findByRole('link', { name: 'Создать профиль' }),
    ).toHaveAttribute('href', '/organizer/profile');
    expect(participantsMock).not.toHaveBeenCalled();
  });

  it('starts the ride reads without waiting for the profile (CR-133)', async () => {
    let resolveProfile: (profile: OrganizerProfileResponse) => void = () => {};
    profileMock.mockReturnValue(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );
    render(<OrganizerOverviewWidget />);

    expect(nearestMock).toHaveBeenCalledTimes(1);
    expect(summaryMock).toHaveBeenCalledTimes(1);
    resolveProfile(PROFILE);
    expect(await screen.findByText('Лист ожидания')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    summaryMock.mockRejectedValueOnce(new Error('network'));
    render(<OrganizerOverviewWidget />);

    fireEvent.click(await screen.findByRole('button'));
    expect(await screen.findByText('Доброе утро')).toBeInTheDocument();
  });
});

const NBSP = '\u00a0';

describe('overview helpers', () => {
  it('counts down in days, then hours, and says «Идёт» for a started ride', () => {
    const at = (iso: string, status: Ride['status'] = 'published') =>
      ({ startsAt: iso, status }) as Ride;
    const now = new Date('2026-10-01T12:00:00Z');
    expect(nearestRideValue(at('2026-10-04T06:00:00Z'), now)).toBe(
      `2${NBSP}дн`,
    );
    expect(nearestRideValue(at('2026-10-01T17:30:00Z'), now)).toBe(`5${NBSP}ч`);
    expect(nearestRideValue(at('2026-10-01T12:40:00Z'), now)).toBe(
      `< 1${NBSP}ч`,
    );
    expect(nearestRideValue(at('2026-10-01T10:00:00Z', 'started'), now)).toBe(
      'Идёт',
    );
  });

  it('shows N/M, or N without a limit', () => {
    expect(registeredValue(15, 20)).toBe('15/20');
    expect(registeredValue(7, null)).toBe('7');
  });
});
