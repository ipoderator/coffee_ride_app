import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
    panTo: ReturnType<typeof vi.fn>;
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
              panTo: vi.fn(),
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
  startDescription: null,
  routePreview: null,
  groups: [],
  waitlistCount: 0,
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
    listPublicRidesMock.mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });

    render(<DiscoveryList />);

    // CR-118: «Топокарта» copy, with its contour illustration.
    const title = await screen.findByText('Заездов на этом листе нет');
    const empty = title.closest('[role="status"]')!;
    expect(empty.querySelector('svg')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  describe('pagination', () => {
    const ride = (n: number): PublicRideListItem => ({
      ...baseRide,
      id: `ride-${n}`,
      title: `Заезд ${n}`,
      startLat: 55.7 + n / 100,
      startLng: 37.5,
    });

    it('offers «Показать ещё», appends the next page with the same query and cursor, and hides the button at the end', async () => {
      listPublicRidesMock
        .mockResolvedValueOnce({
          items: [ride(1), ride(2)],
          nextCursor: 'cursor-1',
          total: 3,
        })
        .mockResolvedValueOnce({
          items: [ride(3)],
          nextCursor: null,
          total: 3,
        });

      render(<DiscoveryList />);

      await screen.findByRole('link', { name: 'Заезд 1' });
      fireEvent.click(
        screen.getByRole('button', { name: 'Показать ещё 1 заезд' }),
      );

      expect(
        await screen.findByRole('link', { name: 'Заезд 3' }),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Заезд 1' })).toBeInTheDocument();
      expect(listPublicRidesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ cursor: 'cursor-1' }),
      );
      expect(
        screen.queryByRole('button', { name: /Показать ещё/ }),
      ).not.toBeInTheDocument();
    });

    it('puts every loaded ride on the map, not only the first page', async () => {
      renderState.available = true;
      listPublicRidesMock
        .mockResolvedValueOnce({
          items: [ride(1)],
          nextCursor: 'cursor-1',
          total: 2,
        })
        .mockResolvedValueOnce({
          items: [ride(2)],
          nextCursor: null,
          total: 2,
        });

      render(<DiscoveryList />);

      await screen.findByRole('link', { name: 'Заезд 1' });
      fireEvent.click(screen.getByRole('button', { name: /Показать ещё/ }));
      await screen.findByRole('link', { name: 'Заезд 2' });

      await waitFor(() => {
        const ids = lastMarkers().map((marker) => marker.id);
        expect(ids).toEqual(expect.arrayContaining(['ride-1', 'ride-2']));
      });
    });

    it('keeps the loaded rides and shows an error when the next page fails', async () => {
      listPublicRidesMock
        .mockResolvedValueOnce({
          items: [ride(1)],
          nextCursor: 'cursor-1',
          total: 2,
        })
        .mockRejectedValueOnce(new Error('network error'));

      render(<DiscoveryList />);

      await screen.findByRole('link', { name: 'Заезд 1' });
      fireEvent.click(screen.getByRole('button', { name: /Показать ещё/ }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Не удалось загрузить ещё заезды',
      );
      expect(screen.getByRole('link', { name: 'Заезд 1' })).toBeInTheDocument();
    });
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
      total: 0,
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

  // KI-060 (CR-164): «Старт» as a label told the reader nothing, so the row hid
  // the line and the card showed no start place at all. The start point's
  // description now backs it, matching ride detail's long-standing fallback.
  it('falls back to the start point description when the label is just «Старт»', async () => {
    listPublicRidesMock.mockResolvedValue({
      items: [
        {
          ...baseRide,
          startLabel: 'Старт',
          startDescription: 'Парковка у велотрека Крылатское.',
        },
      ],
      nextCursor: null,
      total: 0,
    });

    render(<DiscoveryList />);

    const link = await screen.findByRole('link', { name: baseRide.title });
    const row = link.closest('li')!;
    expect(
      within(row).getByText(
        'Старт: Парковка у велотрека Крылатское · Гравийный клуб',
      ),
    ).toBeInTheDocument();
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
      total: 0,
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
      total: 0,
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
      total: 0,
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
      total: 0,
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
      total: 0,
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
      total: 0,
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
      total: 0,
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
      .mockResolvedValueOnce({ items: [baseRide], nextCursor: null, total: 0 })
      .mockResolvedValueOnce({ items: [], nextCursor: null, total: 0 })
      .mockResolvedValueOnce({ items: [baseRide], nextCursor: null, total: 0 });

    render(<DiscoveryList />);
    await screen.findByText(baseRide.title);

    fireEvent.change(screen.getByLabelText('Тип велосипеда'), {
      target: { value: 'road' },
    });

    expect(
      await screen.findByText('Под эти фильтры заездов пока нет'),
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
      total: 0,
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
      total: 0,
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
      total: 0,
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
        total: 0,
      })
      .mockResolvedValueOnce({
        items: [plottableB],
        nextCursor: null,
        total: 0,
      });

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
      total: 0,
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
      total: 0,
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
      total: 0,
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

describe('DiscoveryMap camera on selection (CR-170, CR-171)', () => {
  beforeEach(() => {
    renderState.available = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function renderReadyList() {
    listPublicRidesMock.mockResolvedValue({
      items: [plottableA, plottableB],
      nextCursor: null,
      total: 0,
    });
    render(<DiscoveryList />);
    await screen.findByText('Заезд Б');
    await waitFor(() => expect(renderState.handle).not.toBeNull());
  }

  // ride-a's start plus its route preview.
  const rideAFrame = [
    { lat: 55.7, lng: 37.5 },
    { lat: 55.7, lng: 37.5 },
    { lat: 55.72, lng: 37.55 },
  ];

  it('frames the whole route of a ride selected from the keyboard', async () => {
    await renderReadyList();

    act(() => {
      screen.getByRole('link', { name: 'Заезд А' }).focus();
    });

    await waitFor(() =>
      expect(renderState.handle!.fitBounds).toHaveBeenLastCalledWith(
        rideAFrame,
        { padding: 56, maxZoom: 14, durationMs: 600 },
      ),
    );
    expect(renderState.handle!.panTo).not.toHaveBeenCalled();
  });

  it('frames the cached full line when it is already here, once per choice', async () => {
    const fullLine = [
      { lat: 55.7, lng: 37.5, elevationMeters: null },
      { lat: 55.73, lng: 37.52, elevationMeters: null },
      { lat: 55.72, lng: 37.55, elevationMeters: null },
    ];
    getRouteGeometryMock.mockResolvedValue({ points: fullLine });
    await renderReadyList();

    // Hover first: the full line is fetched and cached, the camera stays.
    const row = screen.getByText('Заезд А').closest('li')!;
    fireEvent.mouseEnter(row);
    await waitFor(() => expect(getRouteGeometryMock).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        (
          renderState.handle!.setPolyline.mock.calls.at(-1)![0] as {
            points: unknown[];
          }
        ).points,
      ).toHaveLength(3),
    );
    const fitsBefore = renderState.handle!.fitBounds.mock.calls.length;

    act(() => {
      screen.getByRole('link', { name: 'Заезд А' }).focus();
    });

    await waitFor(() =>
      expect(renderState.handle!.fitBounds).toHaveBeenLastCalledWith(
        [{ lat: 55.7, lng: 37.5 }, ...fullLine],
        expect.objectContaining({ durationMs: 600 }),
      ),
    );
    expect(renderState.handle!.fitBounds.mock.calls.length).toBe(
      fitsBefore + 1,
    );
  });

  it('eases to the start of a ride without a route, keeping the zoom', async () => {
    await renderReadyList();

    act(() => {
      renderState.options!.onMarkerClick!('ride-b');
    });

    await waitFor(() =>
      expect(renderState.handle!.panTo).toHaveBeenLastCalledWith(
        { lat: 55.9, lng: 37.8 },
        { durationMs: 600 },
      ),
    );
  });

  it('does not move the camera on a hover sweep', async () => {
    await renderReadyList();
    const fitsBefore = renderState.handle!.fitBounds.mock.calls.length;

    const row = screen.getByText('Заезд А').closest('li')!;
    fireEvent.mouseEnter(row);
    fireEvent.mouseLeave(row);

    await waitFor(() =>
      expect(lastMarkers().find((m) => m.id === 'ride-a')?.selected).toBe(
        false,
      ),
    );
    expect(renderState.handle!.panTo).not.toHaveBeenCalled();
    expect(renderState.handle!.fitBounds.mock.calls.length).toBe(fitsBefore);
  });

  it('jumps without animation under prefers-reduced-motion', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    await renderReadyList();

    act(() => {
      renderState.options!.onMarkerClick!('ride-a');
    });

    await waitFor(() =>
      expect(renderState.handle!.fitBounds).toHaveBeenLastCalledWith(
        rideAFrame,
        expect.objectContaining({ durationMs: 0 }),
      ),
    );
  });
});

describe('DiscoveryMap as the emotional layer (CR-171)', () => {
  beforeEach(() => {
    renderState.available = true;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A climbing line: 120 m → 214 m at the middle → 130 m.
  const climbingLine = [
    { lat: 55.7, lng: 37.5, elevationMeters: 120 },
    { lat: 55.705, lng: 37.51, elevationMeters: 160 },
    { lat: 55.71, lng: 37.525, elevationMeters: 214 },
    { lat: 55.715, lng: 37.54, elevationMeters: 170 },
    { lat: 55.72, lng: 37.55, elevationMeters: 130 },
  ];

  async function hoverRideA() {
    listPublicRidesMock.mockResolvedValue({
      items: [plottableA, plottableB],
      nextCursor: null,
      total: 0,
    });
    render(<DiscoveryList />);
    const row = (await screen.findByText('Заезд А')).closest('li')!;
    await waitFor(() => expect(renderState.handle).not.toBeNull());
    fireEvent.mouseEnter(row);
    return row;
  }

  function polylineCalls() {
    return renderState.handle!.setPolyline.mock.calls.map(
      ([input]) => input as { drawInMs?: number; points: unknown[] } | null,
    );
  }

  it('draws a newly chosen route in, and the full geometry continues that draw', async () => {
    getRouteGeometryMock.mockResolvedValue({ points: climbingLine });
    await hoverRideA();

    await waitFor(() =>
      expect(polylineCalls().at(-1)?.points).toHaveLength(climbingLine.length),
    );
    const drawn = polylineCalls().filter((call) => call !== null);
    // The first line of this ride starts the draw ...
    expect(drawn[0]).toMatchObject({ drawInMs: 900 });
    // ... the full geometry arriving mid-draw does not restart it.
    expect(drawn.at(-1)).not.toHaveProperty('drawInMs');
    expect(drawn.filter((call) => call!.drawInMs)).toHaveLength(1);
  });

  it("pulses the chosen ride's start, and only that one", async () => {
    await hoverRideA();

    await waitFor(() =>
      expect(lastMarkers().find((m) => m.id === 'ride-a')?.pulse).toBe(true),
    );
    expect(lastMarkers().find((m) => m.id === 'ride-b')).not.toHaveProperty(
      'pulse',
    );
  });

  it('puts the difficulty and, once elevation is known, the summit on the line', async () => {
    getRouteGeometryMock.mockResolvedValue({ points: climbingLine });
    await hoverRideA();

    await waitFor(() =>
      expect(lastMarkers().map((m) => m.id)).toContain('ride-a:summit'),
    );
    const difficulty = lastMarkers().find((m) => m.id === 'ride-a:difficulty')!;
    expect(difficulty).toMatchObject({
      shape: 'tag',
      label: 'Средний',
      meter: { filled: 3, total: 5 },
    });
    expect(typeof difficulty.revealDelayMs).toBe('number');
    const summit = lastMarkers().find((m) => m.id === 'ride-a:summit')!;
    expect(summit).toMatchObject({
      shape: 'tag',
      label: '▲ 214\u00a0м', // NBSP before the unit (§7)
      point: { lat: 55.71, lng: 37.525 },
    });

    // The difficulty note keeps its first reveal delay across updates — a
    // note already showing is never faded in again.
    const firstDelay = renderState
      .handle!.setMarkers.mock.calls.map(([markers]) =>
        (markers as MapMarkerInput[]).find((m) => m.id === 'ride-a:difficulty'),
      )
      .find(Boolean)!.revealDelayMs;
    expect(difficulty.revealDelayMs).toBe(firstDelay);
  });

  it('drops the notes and the line when the ride is no longer chosen', async () => {
    const row = await hoverRideA();
    await waitFor(() =>
      expect(lastMarkers().map((m) => m.id)).toContain('ride-a:difficulty'),
    );

    fireEvent.mouseLeave(row);

    await waitFor(() =>
      expect(renderState.handle!.setPolyline).toHaveBeenLastCalledWith(null),
    );
    expect(lastMarkers().map((m) => m.id)).toEqual(['ride-a', 'ride-b']);
  });

  it('under reduced motion: no draw, no pulse, notes shown at once', async () => {
    vi.stubGlobal(
      'matchMedia',
      (query: string) =>
        ({
          matches: query.includes('prefers-reduced-motion'),
          media: query,
          addEventListener: () => {},
          removeEventListener: () => {},
          addListener: () => {},
          removeListener: () => {},
          onchange: null,
          dispatchEvent: () => false,
        }) as MediaQueryList,
    );
    await hoverRideA();

    await waitFor(() =>
      expect(lastMarkers().map((m) => m.id)).toContain('ride-a:difficulty'),
    );
    expect(polylineCalls().some((call) => call?.drawInMs)).toBe(false);
    expect(lastMarkers().some((m) => m.pulse)).toBe(false);
    expect(lastMarkers().some((m) => m.revealDelayMs !== undefined)).toBe(
      false,
    );
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
      total: 0,
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
