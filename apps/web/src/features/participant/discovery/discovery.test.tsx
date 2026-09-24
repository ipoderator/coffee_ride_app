import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MapHandle, MapMarkerInput, MapRenderOptions } from 'maps-core';
import type { PublicRideListItem } from 'types';
import { DiscoveryList } from './components/DiscoveryList';
import { getRouteGeometry, listPublicRides } from './api';
import { projectRoutePreview, smoothRoutePreview } from './lib/route-preview';

// CR-118: the map renderer is a fake that records what discovery draws — no
// MapGL/WebGL in jsdom (same approach as route-builder.test.tsx). Off by
// default, i.e. "no MapGL key", so the degraded placeholder path is the
// baseline; map-sync tests switch it on.
const renderState = vi.hoisted(() => ({
  options: null as MapRenderOptions | null,
  handle: null as {
    setMarkers: ReturnType<typeof vi.fn>;
    setPolyline: ReturnType<typeof vi.fn>;
    fitBounds: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  } | null,
  available: false,
}));

vi.mock('@/lib/maps/create-map-renderer', () => ({
  createMapRenderer: () =>
    renderState.available
      ? {
          render: async (options: MapRenderOptions): Promise<MapHandle> => {
            renderState.options = options;
            renderState.handle = {
              setMarkers: vi.fn(),
              setPolyline: vi.fn(),
              fitBounds: vi.fn(),
              destroy: vi.fn(),
            };
            return renderState.handle as unknown as MapHandle;
          },
        }
      : null,
}));

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    listPublicRides: vi.fn(),
    getRouteGeometry: vi.fn(),
  };
});

const listPublicRidesMock = vi.mocked(listPublicRides);
const getRouteGeometryMock = vi.mocked(getRouteGeometry);

const baseRide: PublicRideListItem = {
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
  participantsVisible: true,
  status: 'published',
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  updatedBy: 'user-1',
  organizer: {
    id: 'org-1',
    name: 'Гравийный клуб',
    avatarUrl: null,
    rating: null,
    reviewCount: 0,
  },
  registrationsCount: 0,
  startLabel: null,
  routePreview: null,
  groups: [],
};

beforeEach(() => {
  listPublicRidesMock.mockReset();
  getRouteGeometryMock.mockReset();
  // Default: the full line never arrives, so the smoothed preview stays.
  getRouteGeometryMock.mockReturnValue(new Promise(() => {}));
  renderState.available = false;
  renderState.options = null;
  renderState.handle = null;
});

describe('DiscoveryList', () => {
  it('shows an error state on a network/server failure', async () => {
    listPublicRidesMock.mockRejectedValue(new Error('network error'));

    render(<DiscoveryList />);

    expect(
      await screen.findByText(
        'Не удалось загрузить заезды. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the empty-sheet state when there are no rides', async () => {
    listPublicRidesMock.mockResolvedValue({ items: [], nextCursor: null });

    render(<DiscoveryList />);

    // CR-118: «Топокарта» copy, with its contour illustration.
    const title = await screen.findByText('Заездов на этом листе нет');
    const empty = title.closest('[role="status"]')!;
    expect(empty.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders a legend row: start line, title link, start, metrics and chips', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [
        {
          ...baseRide,
          startLabel: 'Парк Горького',
          registrationsCount: 14,
        },
      ],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    const link = await screen.findByRole('link', { name: baseRide.title });
    expect(link).toHaveAttribute('href', '/rides/ride-1');
    const row = link.closest('li')!;
    // Local start in the ride's own zone (ADR-012): 05:00Z is 08:00 in Moscow.
    expect(
      within(row).getByText(/^сб 1 мая 2027 · 08:00 · МСК$/),
    ).toBeInTheDocument();
    expect(
      within(row).getByText('Старт: Парк Горького · Гравийный клуб'),
    ).toBeInTheDocument();
    expect(within(row).getByText('42,3')).toBeInTheDocument();
    expect(within(row).getByText('350')).toBeInTheDocument();
    expect(within(row).getByText('24,5')).toBeInTheDocument();
    expect(within(row).getByText('Осталось 6 мест')).toBeInTheDocument();
    expect(within(row).getByText('Средний')).toBeInTheDocument();
    expect(within(row).getByText('500 ₽')).toBeInTheDocument();
    expect(within(row).getByText('Опубликован')).toBeInTheDocument();
    // The card's "first three" (distance/elevation/pace) never includes duration.
    expect(within(row).queryByText(/2 ч 30/)).not.toBeInTheDocument();
  });

  it('shows the pace range and group count when the ride has two or more groups', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [
        {
          ...baseRide,
          groups: [
            { name: 'Группа 1', paceKmh: 25 },
            { name: 'Группа 2', paceKmh: 35 },
          ],
        },
      ],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    await screen.findByText(baseRide.title);
    expect(screen.getByText('25–35')).toBeInTheDocument();
    expect(screen.getByText('· 2 группы')).toBeInTheDocument();
    // Group paces replace the ride's own average pace.
    expect(screen.queryByText('24,5')).not.toBeInTheDocument();
  });

  it("shows a single group's pace instead of the ride pace", async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [{ ...baseRide, groups: [{ name: 'Все', paceKmh: 28 }] }],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    await screen.findByText(baseRide.title);
    expect(screen.getByText('28')).toBeInTheDocument();
    expect(screen.queryByText(/группы/)).not.toBeInTheDocument();
  });

  it('says «Мест нет» for a full ride and shows no seats chip without a limit', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [
        { ...baseRide, registrationsCount: 20 },
        {
          ...baseRide,
          id: 'ride-2',
          title: 'Без лимита',
          participantLimit: null,
        },
      ],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    const fullRow = (await screen.findByText(baseRide.title)).closest('li')!;
    expect(within(fullRow).getByText('Мест нет')).toBeInTheDocument();
    const openRow = screen.getByText('Без лимита').closest('li')!;
    expect(
      within(openRow).queryByText(/Осталось|Мест нет/),
    ).not.toBeInTheDocument();
  });

  it('omits a metric for a field that is still null, never showing 0', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [{ ...baseRide, elevationGainMeters: null, paceKmh: null }],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    const row = (await screen.findByText(baseRide.title)).closest('li')!;
    expect(within(row).getByText('42,3')).toBeInTheDocument();
    expect(within(row).queryByText('0')).not.toBeInTheDocument();
    expect(within(row).queryByText('—')).not.toBeInTheDocument();
    expect(within(row).queryByText('м')).not.toBeInTheDocument();
  });

  it('keeps «Бесплатно» a small chip, never a heading-sized metric', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [{ ...baseRide, priceRub: null }],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    await screen.findByText(baseRide.title);
    const price = screen.getByText('Бесплатно');
    expect(price.closest('h1, h2, h3')).toBeNull();
    expect(price.className).toContain('text-xs');
    // Not part of the metric line either (distance/elevation/pace only).
    expect(
      screen.getByText('42,3').parentElement!.parentElement,
    ).not.toContainElement(price);
  });

  it("draws the ride's routePreview as its legend glyph, or the start triangle without one", async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [
        {
          ...baseRide,
          routePreview: [
            [55.7, 37.5],
            [55.8, 37.6],
            [55.75, 37.7],
          ],
        },
        { ...baseRide, id: 'ride-2', title: 'Без маршрута' },
      ],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    const withRoute = (await screen.findByText(baseRide.title)).closest('li')!;
    expect(
      withRoute.querySelector('[data-testid="route-preview-glyph"] polyline'),
    ).toBeInTheDocument();
    const withoutRoute = screen.getByText('Без маршрута').closest('li')!;
    expect(
      withoutRoute.querySelector('[data-testid="start-glyph"]'),
    ).toBeInTheDocument();
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

  it('keeps the list fully usable with the degraded notice when the map is unavailable', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [baseRide],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    expect(
      await screen.findByText(
        'Карта временно недоступна. Используйте список заездов.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: baseRide.title }),
    ).toBeInTheDocument();
  });

  it('shows the map and the list together, with no list/map toggle (CR-118)', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [baseRide],
      nextCursor: null,
    });

    render(<DiscoveryList />);
    await screen.findByText(baseRide.title);

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByTestId('discovery-list-panel').className).not.toContain(
      'hidden',
    );
    expect(screen.getByTestId('discovery-map-panel').className).not.toContain(
      'hidden',
    );
  });
});

const plottableA: PublicRideListItem = {
  ...baseRide,
  id: 'ride-a',
  title: 'Заезд А',
  startLat: 55.7,
  startLng: 37.5,
  routePreview: [
    [55.7, 37.5],
    [55.72, 37.55],
  ],
};
const plottableB: PublicRideListItem = {
  ...baseRide,
  id: 'ride-b',
  title: 'Заезд Б',
  bicycleType: 'road',
  startsAt: '2027-05-02T04:30:00.000Z',
  startLat: 55.9,
  startLng: 37.8,
};

function lastMarkers(): MapMarkerInput[] {
  const calls = renderState.handle!.setMarkers.mock.calls;
  return calls[calls.length - 1]![0] as MapMarkerInput[];
}

describe('DiscoveryMap ↔ list sync (CR-118)', () => {
  beforeEach(() => {
    renderState.available = true;
  });

  it('pins every plottable ride as a start-time ring and frames them', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [plottableA, plottableB, baseRide],
      nextCursor: null,
    });

    render(<DiscoveryList />);

    await waitFor(() =>
      expect(lastMarkers().map((marker) => marker.id)).toEqual([
        'ride-a',
        'ride-b',
      ]),
    );
    expect(lastMarkers()[0]).toMatchObject({
      shape: 'ring',
      label: '08:00',
      point: { lat: 55.7, lng: 37.5 },
      selected: false,
    });
    expect(lastMarkers()[1]).toMatchObject({ label: '07:30' });
    expect(renderState.handle!.fitBounds).toHaveBeenLastCalledWith(
      [
        { lat: 55.7, lng: 37.5 },
        { lat: 55.9, lng: 37.8 },
      ],
      expect.objectContaining({ maxZoom: 12 }),
    );
  });

  it('updates the markers and re-frames when the filtered rides change', async () => {
    listPublicRidesMock
      .mockResolvedValueOnce({
        items: [plottableA, plottableB],
        nextCursor: null,
      })
      .mockResolvedValueOnce({ items: [plottableB], nextCursor: null });

    render(<DiscoveryList />);
    await waitFor(() => expect(lastMarkers()).toHaveLength(2));

    fireEvent.change(screen.getByLabelText('Тип велосипеда'), {
      target: { value: 'road' },
    });

    await waitFor(() =>
      expect(lastMarkers().map((marker) => marker.id)).toEqual(['ride-b']),
    );
    expect(renderState.handle!.fitBounds).toHaveBeenLastCalledWith(
      [{ lat: 55.9, lng: 37.8 }],
      expect.anything(),
    );
  });

  it("hovering a row draws that ride's route and highlights its pin", async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [plottableA, plottableB],
      nextCursor: null,
    });

    render(<DiscoveryList />);
    const row = (await screen.findByText('Заезд А')).closest('li')!;
    await waitFor(() => expect(renderState.handle).not.toBeNull());

    const fullLine = [
      { lat: 55.7, lng: 37.5, elevationMeters: null },
      { lat: 55.705, lng: 37.51, elevationMeters: null },
      { lat: 55.71, lng: 37.53, elevationMeters: null },
      { lat: 55.72, lng: 37.55, elevationMeters: null },
    ];
    getRouteGeometryMock.mockResolvedValue({ points: fullLine });

    fireEvent.mouseEnter(row);

    // The ride's full stored line replaces the ≤ 40-point preview, fetched
    // once for the active ride.
    await waitFor(() =>
      expect(renderState.handle!.setPolyline).toHaveBeenLastCalledWith(
        expect.objectContaining({
          points: fullLine.map(({ lat, lng }) => ({ lat, lng })),
          width: 5,
        }),
      ),
    );
    expect(getRouteGeometryMock).toHaveBeenCalledWith('ride-a');
    expect(row).toHaveAttribute('data-active', 'true');
    expect(lastMarkers().find((m) => m.id === 'ride-a')?.selected).toBe(true);

    fireEvent.mouseLeave(row);

    await waitFor(() =>
      expect(renderState.handle!.setPolyline).toHaveBeenLastCalledWith(null),
    );
    expect(row).toHaveAttribute('data-active', 'false');
  });

  it('selects a ride from the keyboard: focusing its link draws the route', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [plottableA, plottableB],
      nextCursor: null,
    });

    render(<DiscoveryList />);
    const link = await screen.findByRole('link', { name: 'Заезд А' });
    await waitFor(() => expect(renderState.handle).not.toBeNull());

    act(() => {
      link.focus();
    });

    await waitFor(() =>
      expect(renderState.handle!.setPolyline).toHaveBeenLastCalledWith(
        expect.objectContaining({ width: 5 }),
      ),
    );
    expect(link.closest('li')).toHaveAttribute('data-active', 'true');
  });

  it('clicking a pin selects its row and, on a phone, raises it over the map', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [plottableA, plottableB],
      nextCursor: null,
    });

    render(<DiscoveryList />);
    await screen.findByText('Заезд Б');
    await waitFor(() => expect(renderState.options).not.toBeNull());

    act(() => {
      renderState.options!.onMarkerClick!('ride-b');
    });

    const rows = screen
      .getAllByRole('link', { name: 'Заезд Б' })
      .map((link) => link.closest('li')!);
    // The list row plus the raised copy (jsdom's matchMedia reports "not lg").
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveAttribute('data-active', 'true');
    }
    expect(lastMarkers().find((m) => m.id === 'ride-b')?.selected).toBe(true);

    fireEvent.click(
      screen.getByRole('button', { name: 'Скрыть карточку заезда' }),
    );
    expect(screen.getAllByRole('link', { name: 'Заезд Б' })).toHaveLength(1);
  });
});

describe('projectRoutePreview', () => {
  it('fits the route into the box with north up and longitude scaled by latitude', () => {
    // Equal degree spans at ~60°N: the east-west side is half as long (cos 60°).
    const points = projectRoutePreview(
      [
        [60, 30],
        [61, 31],
      ],
      32,
      2,
    )!;
    const [start, end] = points.split(' ').map((p) => p.split(',').map(Number));
    // North (higher latitude) is up: the end point is above the start.
    expect(end![1]).toBeLessThan(start![1]!);
    // Latitude spans the full inner box (28px) ...
    expect(start![1]! - end![1]!).toBeCloseTo(28, 0);
    // ... longitude about half of it, centred.
    expect(end![0]! - start![0]!).toBeCloseTo(14, 0);
    expect(start![0]).toBeCloseTo(9, 0);
  });

  it('returns null for nothing drawable', () => {
    expect(projectRoutePreview(null)).toBeNull();
    expect(projectRoutePreview([[55, 37]])).toBeNull();
    expect(
      projectRoutePreview([
        [55, 37],
        [55, 37],
      ]),
    ).toBeNull();
  });
});

describe('route line smoothing', () => {
  it('draws the preview smoothed while the full line is not there', async () => {
    renderState.available = true;
    listPublicRidesMock.mockResolvedValue({
      items: [plottableA],
      nextCursor: null,
    });
    // `beforeEach`: the geometry request never resolves.

    render(<DiscoveryList />);
    const row = (await screen.findByText('Заезд А')).closest('li')!;
    await waitFor(() => expect(renderState.handle).not.toBeNull());
    fireEvent.mouseEnter(row);

    await waitFor(() =>
      expect(renderState.handle!.setPolyline).toHaveBeenLastCalledWith(
        expect.objectContaining({
          points: smoothRoutePreview(plottableA.routePreview!).map(
            ([lat, lng]) => ({ lat, lng }),
          ),
        }),
      ),
    );
  });

  it('cuts corners but keeps both ends of the route', () => {
    const preview: Array<[number, number]> = [
      [55.7, 37.5],
      [55.8, 37.5],
      [55.8, 37.6],
    ];
    const smoothed = smoothRoutePreview(preview);
    expect(smoothed[0]).toEqual([55.7, 37.5]);
    expect(smoothed[smoothed.length - 1]).toEqual([55.8, 37.6]);
    // Two Chaikin passes (ends kept, two points per segment): 3 → 6 → 12, and
    // the sharp corner itself is no longer on the line.
    expect(smoothed).toHaveLength(12);
    expect(smoothed).not.toContainEqual([55.8, 37.5]);
    expect(
      smoothRoutePreview([
        [55.7, 37.5],
        [55.8, 37.6],
      ]),
    ).toHaveLength(2);
  });
});
