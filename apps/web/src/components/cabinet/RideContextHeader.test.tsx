import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride } from 'types';
import { fetchOwnRide } from '@/lib/organizer/own-rides';
import { RideContextHeader } from './RideContextHeader';

vi.mock('@/lib/organizer/own-rides', () => ({ fetchOwnRide: vi.fn() }));
const rideMock = vi.mocked(fetchOwnRide);

const RIDE = {
  id: 'ride-7',
  title: 'Гравий: круг по Серебряному бору',
  status: 'started',
  // Sunday 4 October 2026, 09:00 Moscow.
  startsAt: '2026-10-04T06:00:00.000Z',
  startTimezone: 'Europe/Moscow',
} as Ride;

describe('RideContextHeader (CR-185)', () => {
  beforeEach(() => {
    rideMock.mockReset();
  });

  it('names the ride, its start and status, and links to its management view', async () => {
    rideMock.mockResolvedValue(RIDE);
    render(<RideContextHeader rideId="ride-7" />);

    expect(
      await screen.findByText('Гравий: круг по Серебряному бору'),
    ).toBeInTheDocument();
    expect(screen.getByText('Заезд начался')).toBeInTheDocument();
    expect(screen.getByText(/4 октября/i)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Управление заездом →' }),
    ).toHaveAttribute('href', '/organizer/rides/ride-7/edit');
    expect(screen.queryByText('Требует решения')).not.toBeInTheDocument();
    expect(rideMock).toHaveBeenCalledWith('ride-7');
  });

  it('flags a start that passed without the ride being started', async () => {
    rideMock.mockResolvedValue({
      ...RIDE,
      status: 'registration_open',
      startsAt: '2020-10-01T05:00:00.000Z',
    });
    render(<RideContextHeader rideId="ride-7" />);

    expect(await screen.findByText('Требует решения')).toBeInTheDocument();
    expect(screen.getByText('Регистрация открыта')).toBeInTheDocument();
  });

  it('shows an error with retry', async () => {
    rideMock.mockRejectedValueOnce(new Error('network'));
    rideMock.mockResolvedValueOnce(RIDE);
    render(<RideContextHeader rideId="ride-7" />);

    expect(
      await screen.findByText('Не удалось загрузить данные заезда.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    expect(
      await screen.findByText('Гравий: круг по Серебряному бору'),
    ).toBeInTheDocument();
  });
});
