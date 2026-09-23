import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLng, MapHandle, MapRenderOptions } from 'maps-core';
import { RouteBuilder } from './components/RouteBuilder';
import { ApiError, buildRoute, getRouteGeometry } from './api';

// CR-114: the map renderer is replaced with a fake that records what the
// builder draws and lets a test "click" the map — no MapGL/WebGL in jsdom.
const renderState = vi.hoisted(() => ({
  options: null as MapRenderOptions | null,
  handle: null as {
    setMarkers: ReturnType<typeof vi.fn>;
    setPolyline: ReturnType<typeof vi.fn>;
    fitBounds: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  } | null,
  available: true,
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
  return { ...actual, buildRoute: vi.fn(), getRouteGeometry: vi.fn() };
});

const buildRouteMock = vi.mocked(buildRoute);
const getRouteGeometryMock = vi.mocked(getRouteGeometry);

const ROAD_LINE = [
  { lat: 55.75, lng: 37.6, elevationMeters: 100 },
  { lat: 55.755, lng: 37.61, elevationMeters: 130 },
  { lat: 55.76, lng: 37.6, elevationMeters: 120 },
];

async function renderBuilder(
  props: Partial<Parameters<typeof RouteBuilder>[0]> = {},
) {
  const onBuilt = vi.fn().mockResolvedValue(undefined);
  render(
    <RouteBuilder
      rideId="ride-1"
      hasRoute={false}
      start={null}
      onBuilt={onBuilt}
      {...props}
    />,
  );
  await waitFor(() => expect(renderState.handle).not.toBeNull());
  return { onBuilt };
}

function clickMap(point: LatLng) {
  act(() => {
    renderState.options!.onClick!(point);
  });
}

describe('RouteBuilder', () => {
  beforeEach(() => {
    renderState.options = null;
    renderState.handle = null;
    renderState.available = true;
    buildRouteMock.mockReset();
    getRouteGeometryMock.mockReset();
    getRouteGeometryMock.mockResolvedValue(ROAD_LINE);
  });

  it('adds a numbered waypoint for every map click', async () => {
    await renderBuilder();

    clickMap({ lat: 55.75, lng: 37.6 });
    clickMap({ lat: 55.76, lng: 37.6 });

    expect(screen.getByText('Точка 1')).toBeInTheDocument();
    expect(screen.getByText('Точка 2')).toBeInTheDocument();
    const markers = renderState.handle!.setMarkers.mock.calls.at(-1)![0];
    expect(markers.map((m: { label: string }) => m.label)).toEqual(['1', '2']);
  });

  it('keeps "build" disabled until there are two points', async () => {
    await renderBuilder();
    const button = screen.getByRole('button', { name: 'Построить маршрут' });

    expect(button).toBeDisabled();
    clickMap({ lat: 55.75, lng: 37.6 });
    expect(button).toBeDisabled();
    clickMap({ lat: 55.76, lng: 37.6 });
    expect(button).toBeEnabled();
  });

  it('sends the waypoints in order and draws the 2GIS line it gets back — not the waypoints', async () => {
    buildRouteMock.mockResolvedValue({} as never);
    const { onBuilt } = await renderBuilder();
    clickMap({ lat: 55.75, lng: 37.6 });
    clickMap({ lat: 55.76, lng: 37.6 });

    fireEvent.click(screen.getByRole('button', { name: 'Построить маршрут' }));

    await waitFor(() => expect(onBuilt).toHaveBeenCalled());
    expect(buildRouteMock).toHaveBeenCalledWith('ride-1', [
      { lat: 55.75, lng: 37.6 },
      { lat: 55.76, lng: 37.6 },
    ]);
    const polyline = renderState.handle!.setPolyline.mock.calls.at(-1)![0];
    expect(polyline.points).toEqual(ROAD_LINE);
    expect(renderState.handle!.fitBounds).toHaveBeenCalledWith(
      ROAD_LINE,
      expect.anything(),
    );
  });

  it('closes the loop by repeating the first point at the end', async () => {
    await renderBuilder();
    clickMap({ lat: 55.75, lng: 37.6 });
    clickMap({ lat: 55.76, lng: 37.6 });

    fireEvent.click(screen.getByRole('button', { name: 'Замкнуть круг' }));

    expect(screen.getByText('Точка 3')).toBeInTheDocument();
    expect(screen.getAllByText('55.75000, 37.60000')).toHaveLength(2);
  });

  it('removes a single point, the last point, or all of them', async () => {
    await renderBuilder();
    clickMap({ lat: 55.75, lng: 37.6 });
    clickMap({ lat: 55.76, lng: 37.61 });
    clickMap({ lat: 55.77, lng: 37.62 });

    fireEvent.click(screen.getByRole('button', { name: 'Удалить точку 1' }));
    expect(screen.queryByText('55.75000, 37.60000')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Убрать последнюю' }));
    expect(screen.queryByText('55.77000, 37.62000')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Очистить' }));
    expect(
      screen.getByText('Точек пока нет — нажмите на карту.'),
    ).toBeInTheDocument();
  });

  it('explains a route_not_buildable answer instead of drawing anything', async () => {
    buildRouteMock.mockRejectedValue(
      new ApiError({
        type: 'about:blank',
        title: 'No route',
        status: 422,
        detail: 'No road route connects these points.',
        instance: '/v1/rides/ride-1/route/build',
        code: 'route_not_buildable',
      }),
    );
    await renderBuilder();
    clickMap({ lat: 55.75, lng: 37.6 });
    clickMap({ lat: 55.76, lng: 37.6 });

    fireEvent.click(screen.getByRole('button', { name: 'Построить маршрут' }));

    expect(
      await screen.findByText(/Между этими точками нет проезда/),
    ).toBeInTheDocument();
    expect(getRouteGeometryMock).not.toHaveBeenCalled();
  });

  it('shows the stored route line on open when the ride already has one', async () => {
    await renderBuilder({ hasRoute: true });

    await waitFor(() =>
      expect(renderState.handle!.setPolyline).toHaveBeenCalledWith(
        expect.objectContaining({ points: ROAD_LINE }),
      ),
    );
  });

  it('degrades to a message when the map is unavailable', async () => {
    renderState.available = false;
    render(
      <RouteBuilder
        rideId="ride-1"
        hasRoute={false}
        start={null}
        onBuilt={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(
        'Карта недоступна — построить маршрут сейчас нельзя.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Построить маршрут' }),
    ).toBeDisabled();
  });
});
