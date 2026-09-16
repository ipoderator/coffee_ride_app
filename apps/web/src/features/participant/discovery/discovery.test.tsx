import { fireEvent, render, screen } from '@testing-library/react';
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
  startLat: null,
  startLng: null,
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
  organizer: {
    id: 'org-1',
    name: 'Гравийный клуб',
    rating: null,
    reviewCount: 0,
  },
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

  it('refetches with the selected bicycleType when the filter changes', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [baseRide],
      nextCursor: null,
    });

    render(<DiscoveryList />);
    await screen.findByText(baseRide.title);
    expect(listPublicRidesMock).toHaveBeenLastCalledWith({
      bicycleType: undefined,
    });

    fireEvent.change(screen.getByLabelText('Тип велосипеда'), {
      target: { value: 'road' },
    });

    await screen.findByText(baseRide.title);
    expect(listPublicRidesMock).toHaveBeenLastCalledWith({
      bicycleType: 'road',
    });
  });

  it('shows a filtered empty state with a working reset action that restores the full list', async () => {
    listPublicRidesMock
      .mockResolvedValueOnce({ items: [baseRide], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [baseRide], nextCursor: null });

    render(<DiscoveryList />);
    await screen.findByText(baseRide.title);

    fireEvent.change(screen.getByLabelText('Тип велосипеда'), {
      target: { value: 'road' },
    });

    expect(
      await screen.findByText('Пока нет заездов по этим фильтрам'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));

    expect(await screen.findByText(baseRide.title)).toBeInTheDocument();
    expect(listPublicRidesMock).toHaveBeenLastCalledWith({
      bicycleType: undefined,
    });
  });

  it('switches to the map view and shows the degraded notice instead of a blank pane (CR-026)', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [baseRide],
      nextCursor: null,
    });

    render(<DiscoveryList />);
    await screen.findByText(baseRide.title);

    fireEvent.click(screen.getByRole('tab', { name: 'Карта' }));

    expect(
      await screen.findByText(
        'Карта временно недоступна. Используйте список заездов.',
      ),
    ).toBeInTheDocument();
    // CR-044 (`docs/design.md` §11 split view at `lg`): the list panel stays
    // mounted — only CSS-hidden below `lg` — so it's still in the DOM, just
    // flagged `hidden` below the split-view breakpoint. The active panel (map)
    // carries no such class.
    expect(screen.getByTestId('discovery-list-panel').className).toContain(
      'hidden',
    );
    expect(
      screen.getByTestId('discovery-map-panel').className ?? '',
    ).not.toContain('hidden');

    fireEvent.click(screen.getByRole('tab', { name: 'Список' }));

    expect(await screen.findByText(baseRide.title)).toBeInTheDocument();
    expect(
      screen.getByTestId('discovery-list-panel').className ?? '',
    ).not.toContain('hidden');
    expect(screen.getByTestId('discovery-map-panel').className).toContain(
      'hidden',
    );
  });

  it('shows both panels unhidden at once above the lg split-view breakpoint, regardless of the toggle (CR-044)', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [baseRide],
      nextCursor: null,
    });

    render(<DiscoveryList />);
    await screen.findByText(baseRide.title);

    // Neither panel is unconditionally hidden — the `hidden` class is always
    // paired with an `lg:block` override, so a real `lg`+ viewport shows both
    // simultaneously even while `view` still says "list".
    const listPanel = screen.getByTestId('discovery-list-panel');
    const mapPanel = screen.getByTestId('discovery-map-panel');
    expect(listPanel.className ?? '').not.toContain('hidden');
    expect(mapPanel.className).toBe('hidden lg:block');
  });

  it('hides the list/map toggle above the lg split-view breakpoint (CR-044)', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [baseRide],
      nextCursor: null,
    });

    render(<DiscoveryList />);
    await screen.findByText(baseRide.title);

    expect(screen.getByRole('tablist').className).toContain('lg:hidden');
  });
});
