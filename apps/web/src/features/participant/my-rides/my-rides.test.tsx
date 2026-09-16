import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyRegistrationSummary, PublicRide } from 'types';
import { MyRidesView } from './components/MyRidesView';
import { listMyRegistrations } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listMyRegistrations: vi.fn(),
  };
});

const listMyRegistrationsMock = vi.mocked(listMyRegistrations);

const baseRide: PublicRide = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утренний гравийный заезд',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2027-05-01T05:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  startLat: null,
  startLng: null,
  participantLimit: 20,
  priceRub: 500,
  distanceKm: 42.3,
  elevationGainMeters: 350,
  paceKmh: 24.5,
  durationMinutes: 150,
  difficulty: 3,
  status: 'registration_open',
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  updatedBy: 'user-1',
  organizer: {
    id: 'org-1',
    name: 'Гравийный клуб',
    rating: null,
    reviewCount: 0,
  },
};

const baseItem: MyRegistrationSummary = {
  registration: {
    id: 'reg-1',
    rideId: 'ride-1',
    userId: 'user-1',
    status: 'active',
    createdAt: '2027-01-02T00:00:00.000Z',
    updatedAt: '2027-01-02T00:00:00.000Z',
    cancelledAt: null,
  },
  ride: baseRide,
};

describe('MyRidesView', () => {
  beforeEach(() => {
    listMyRegistrationsMock.mockReset();
  });

  it('fetches the upcoming tab by default', async () => {
    listMyRegistrationsMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<MyRidesView />);

    await screen.findByText('Нет предстоящих регистраций');
    expect(listMyRegistrationsMock).toHaveBeenLastCalledWith({
      when: 'upcoming',
    });
  });

  it('shows an error state on a network/server failure', async () => {
    listMyRegistrationsMock.mockRejectedValue(new Error('network error'));

    render(<MyRidesView />);

    expect(
      await screen.findByText(
        'Не удалось загрузить регистрации. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('renders a card per registration with the ride title, status, and organizer', async () => {
    listMyRegistrationsMock.mockResolvedValue({
      items: [baseItem],
      nextCursor: null,
    });

    render(<MyRidesView />);

    expect(await screen.findByText(baseRide.title)).toBeInTheDocument();
    expect(screen.getByText('Регистрация открыта')).toBeInTheDocument();
    expect(screen.getByText(/Гравийный клуб/)).toBeInTheDocument();
  });

  it('switches to the past tab and refetches with when=past', async () => {
    listMyRegistrationsMock
      .mockResolvedValueOnce({ items: [baseItem], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null });

    render(<MyRidesView />);
    await screen.findByText(baseRide.title);

    fireEvent.click(screen.getByRole('tab', { name: 'Прошедшие' }));

    await screen.findByText('Пока нет прошедших заездов');
    expect(listMyRegistrationsMock).toHaveBeenLastCalledWith({ when: 'past' });
  });

  it('links each card into the ride detail page', async () => {
    listMyRegistrationsMock.mockResolvedValue({
      items: [baseItem],
      nextCursor: null,
    });

    render(<MyRidesView />);

    const link = (await screen.findByText(baseRide.title)).closest('a');
    expect(link).toHaveAttribute('href', '/rides/ride-1');
  });
});
