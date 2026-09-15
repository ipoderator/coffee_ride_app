import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRide } from 'types';
import { DiscoveryList } from './components/DiscoveryList';
import { listPublicRides } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listPublicRides: vi.fn(),
  };
});

const listPublicRidesMock = vi.mocked(listPublicRides);

const baseRide: PublicRide = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утренний гравийный заезд',
  description: null,
  coverImageUrl: null,
  bicycleType: 'gravel',
  startsAt: '2027-05-01T05:00:00.000Z',
  startTimezone: 'Europe/Moscow',
  participantLimit: 20,
  priceRub: 500,
  distanceKm: 42.3,
  elevationGainMeters: 350,
  paceKmh: 24.5,
  durationMinutes: 150,
  difficulty: 3,
  status: 'published',
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  updatedBy: 'user-1',
  organizer: { id: 'org-1', name: 'Гравийный клуб' },
};

describe('DiscoveryList', () => {
  beforeEach(() => {
    listPublicRidesMock.mockReset();
  });

  it('shows an error state on a network/server failure', async () => {
    listPublicRidesMock.mockRejectedValue(new Error('network error'));

    render(<DiscoveryList />);

    expect(
      await screen.findByText(
        'Не удалось загрузить заезды. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('shows an empty state when there are no rides', async () => {
    listPublicRidesMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<DiscoveryList />);

    expect(await screen.findByText('Пока нет заездов')).toBeInTheDocument();
  });

  it('renders a card per ride with the organizer name, status, and first-three metrics', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [baseRide],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    expect(await screen.findByText(baseRide.title)).toBeInTheDocument();
    expect(screen.getByText('Опубликован')).toBeInTheDocument();
    expect(screen.getByText(/Гравийный клуб/)).toBeInTheDocument();
    expect(screen.getByText('42,3')).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
    expect(screen.getByText('24,5')).toBeInTheDocument();
    // The card's "first three" (distance/elevation/pace) never includes duration.
    expect(screen.queryByText('Длительность')).not.toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
  });

  it('omits a metric tile for a field that is still null', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [{ ...baseRide, elevationGainMeters: null }],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    await screen.findByText(baseRide.title);
    expect(screen.queryByText('Набор высоты')).not.toBeInTheDocument();
  });
});
