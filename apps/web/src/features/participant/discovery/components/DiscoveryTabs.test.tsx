import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicRideListItem } from 'types';
import { DiscoveryTabs } from './DiscoveryTabs';
import { listPublicRides } from '../api';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    listPublicRides: vi.fn(),
    getRouteGeometry: vi.fn(),
  };
});

vi.mock('@/lib/maps/create-map-renderer', () => ({
  createMapRenderer: () => null,
}));

const listPublicRidesMock = vi.mocked(listPublicRides);

const RIDE: PublicRideListItem = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Тестовый заезд на выходные',
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
  registrationsCount: 15,
  startLabel: null,
  routePreview: null,
  groups: [],
};

beforeEach(() => {
  listPublicRidesMock.mockReset();
  listPublicRidesMock.mockResolvedValue({ items: [RIDE], nextCursor: null });
});

describe('DiscoveryTabs', () => {
  it('shows the route-cover grid by default', async () => {
    render(<DiscoveryTabs />);
    expect(
      await screen.findByText('Тестовый заезд на выходные'),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Заезды' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('switches to the map-first list on the "Карта" tab', async () => {
    render(<DiscoveryTabs />);
    await screen.findByText('Тестовый заезд на выходные');

    fireEvent.click(screen.getByRole('tab', { name: 'Карта' }));

    await waitFor(() => {
      expect(screen.getByTestId('discovery-map-panel')).toBeInTheDocument();
    });
    expect(screen.getByRole('tab', { name: 'Карта' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });
});
