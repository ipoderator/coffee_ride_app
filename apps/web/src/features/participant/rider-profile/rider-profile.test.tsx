import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RiderProfile } from 'types';
import { RiderProfileCard } from './components/RiderProfileCard';
import { ApiError, getRiderProfile } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRiderProfile: vi.fn(),
  };
});

const getRiderProfileMock = vi.mocked(getRiderProfile);

function problem(code: string, status: number): ApiError {
  return new ApiError({
    type: `https://coffee-ride.example/errors/${code}`,
    title: code,
    status,
    detail: code,
    instance: '/v1/rides/ride-1/riders/reg-1/profile',
    code,
  });
}

const baseProfile: RiderProfile = {
  registrationId: 'reg-1',
  displayName: 'Анна Соколова',
  bio: 'Люблю гравийные заезды по выходным.',
  avatarUrl: null,
  bikes: [
    {
      id: 'bike-1',
      bikeType: 'gravel',
      brand: 'Canyon',
      model: 'Grail',
      isActive: true,
    },
  ],
  distanceWeekKm: 120,
  distanceMonthKm: 480,
  distanceYearKm: 5200,
  recentRides: [
    {
      id: 'ride-2',
      title: 'Утренний гравийный заезд',
      startsAt: '2027-05-01T05:00:00.000Z',
    },
  ],
};

describe('RiderProfileCard (CR-126)', () => {
  beforeEach(() => {
    getRiderProfileMock.mockReset();
  });

  it('renders the profile once loaded — bio, a distance stat, a bike, a recent ride link', async () => {
    getRiderProfileMock.mockResolvedValue({ profile: baseProfile });

    render(<RiderProfileCard rideId="ride-1" registrationId="reg-1" />);

    expect(await screen.findByText('Анна Соколова')).toBeInTheDocument();
    expect(
      screen.getByText('Люблю гравийные заезды по выходным.'),
    ).toBeInTheDocument();
    // `formatDistanceParts(120)` -> «120,0» (value) + «км» (unit), separate
    // spans — matching the value alone is enough to confirm the tile renders.
    expect(screen.getByText('120,0')).toBeInTheDocument();
    expect(screen.getByText(/Canyon Grail/)).toBeInTheDocument();
    expect(screen.getByText('Активный')).toBeInTheDocument();
    const link = screen.getByRole('link', {
      name: 'Утренний гравийный заезд',
    });
    expect(link).toHaveAttribute('href', '/rides/ride-2');
    expect(getRiderProfileMock).toHaveBeenCalledWith('ride-1', 'reg-1');
  });

  it('shows the empty recent-rides state when there are none', async () => {
    getRiderProfileMock.mockResolvedValue({
      profile: { ...baseProfile, recentRides: [] },
    });

    render(<RiderProfileCard rideId="ride-1" registrationId="reg-1" />);

    expect(
      await screen.findByText('Недавних заездов пока нет.'),
    ).toBeInTheDocument();
  });

  it('reuses the existing "organizer hid the list" copy on 403 riders_hidden', async () => {
    getRiderProfileMock.mockRejectedValue(problem('riders_hidden', 403));

    render(<RiderProfileCard rideId="ride-1" registrationId="reg-1" />);

    expect(
      await screen.findByText(
        'Организатор скрыл список участников этого заезда.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the profile-private message on 403 profile_private', async () => {
    getRiderProfileMock.mockRejectedValue(problem('profile_private', 403));

    render(<RiderProfileCard rideId="ride-1" registrationId="reg-1" />);

    expect(await screen.findByText('Профиль закрыт')).toBeInTheDocument();
    expect(
      screen.getByText('Участник ограничил доступ к своему профилю.'),
    ).toBeInTheDocument();
  });

  it('shows a not-found message on 404 rider_not_found', async () => {
    getRiderProfileMock.mockRejectedValue(problem('rider_not_found', 404));

    render(<RiderProfileCard rideId="ride-1" registrationId="reg-1" />);

    expect(await screen.findByText('Участник не найден')).toBeInTheDocument();
  });

  it('shows a sign-in prompt on 401', async () => {
    getRiderProfileMock.mockRejectedValue(problem('unauthorized', 401));

    render(<RiderProfileCard rideId="ride-1" registrationId="reg-1" />);

    expect(
      await screen.findByRole('link', {
        name: 'Войдите, чтобы увидеть список',
      }),
    ).toHaveAttribute('href', '/login');
  });

  it('shows a retryable generic error for any other failure, and recovers on retry', async () => {
    getRiderProfileMock.mockRejectedValueOnce(new Error('network error'));
    getRiderProfileMock.mockResolvedValueOnce({ profile: baseProfile });

    render(<RiderProfileCard rideId="ride-1" registrationId="reg-1" />);

    expect(
      await screen.findByText(
        'Не удалось загрузить профиль участника. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Анна Соколова')).toBeInTheDocument();
    expect(getRiderProfileMock).toHaveBeenCalledTimes(2);
  });
});
