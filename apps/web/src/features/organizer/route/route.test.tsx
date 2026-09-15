import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteUploadForm } from './components/RouteUploadForm';
import {
  ApiError,
  createStop,
  deleteRoute,
  deleteStop,
  getRideRouteState,
  replaceRoute,
  syncRideMetricsFromRoute,
  updateStop,
  uploadRoute,
  type RouteSummary,
  type Stop,
} from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRideRouteState: vi.fn(),
    uploadRoute: vi.fn(),
    replaceRoute: vi.fn(),
    deleteRoute: vi.fn(),
    syncRideMetricsFromRoute: vi.fn(),
    createStop: vi.fn(),
    updateStop: vi.fn(),
    deleteStop: vi.fn(),
  };
});

const getRideRouteStateMock = vi.mocked(getRideRouteState);
const uploadRouteMock = vi.mocked(uploadRoute);
const replaceRouteMock = vi.mocked(replaceRoute);
const deleteRouteMock = vi.mocked(deleteRoute);
const syncRideMetricsFromRouteMock = vi.mocked(syncRideMetricsFromRoute);
const createStopMock = vi.mocked(createStop);
const updateStopMock = vi.mocked(updateStop);
const deleteStopMock = vi.mocked(deleteStop);

const baseStop: Stop = {
  id: 'stop-1',
  rideId: 'ride-1',
  name: 'Кофейня на набережной',
  description: null,
  lat: 55.751,
  lng: 37.618,
  durationMinutes: 15,
  position: 0,
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  updatedBy: null,
};

const baseRoute: RouteSummary = {
  id: 'route-1',
  rideId: 'ride-1',
  gpxFileName: 'track.gpx',
  gpxFileSizeBytes: 1234,
  distanceKm: 42.3,
  elevationGainMeters: 350,
  pointCount: 120,
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
};

function selectFile(file: File) {
  const input = screen.getByLabelText('Файл GPX') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe('RouteUploadForm', () => {
  beforeEach(() => {
    getRideRouteStateMock.mockReset();
    uploadRouteMock.mockReset();
    replaceRouteMock.mockReset();
    deleteRouteMock.mockReset();
    syncRideMetricsFromRouteMock.mockReset();
    createStopMock.mockReset();
    updateStopMock.mockReset();
    deleteStopMock.mockReset();
  });

  it('shows a not-found state for a non-existent/foreign ride', async () => {
    getRideRouteStateMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/ride_not_found',
        title: 'Ride not found',
        status: 404,
        detail: 'No ride with that id exists for this account.',
        instance: '/v1/rides/ride-1',
        code: 'ride_not_found',
      }),
    );

    render(<RouteUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText('К редактированию заезда'),
    ).toBeInTheDocument();
  });

  it('shows an error state on a network/server failure', async () => {
    getRideRouteStateMock.mockRejectedValue(new Error('network error'));

    render(<RouteUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Не удалось загрузить заезд. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('shows the empty state and an upload control for a draft ride with no route', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'draft',
      distanceKm: null,
      elevationGainMeters: null,
      route: null,
      stops: [],
    });

    render(<RouteUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText('Маршрут ещё не загружен'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Загрузить трек' }),
    ).toBeInTheDocument();
  });

  it('uploads a GPX file and shows the computed summary', async () => {
    // First call: initial load, no route. Second: `RouteUploadForm` reloads after a
    // successful upload rather than trusting the upload response alone — this
    // mirrors the server's own CR-029 auto-fill (an empty ride's distanceKm/
    // elevationGainMeters get filled from the track), so the reload here returns a
    // ride whose own fields now match the route's, not a mismatch.
    getRideRouteStateMock
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: null,
        elevationGainMeters: null,
        route: null,
        stops: [],
      })
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: baseRoute.distanceKm,
        elevationGainMeters: baseRoute.elevationGainMeters,
        route: baseRoute,
        stops: [],
      });
    uploadRouteMock.mockResolvedValue(baseRoute);

    render(<RouteUploadForm rideId="ride-1" />);
    await screen.findByText('Маршрут ещё не загружен');

    selectFile(
      new File(['<gpx></gpx>'], 'track.gpx', { type: 'application/gpx+xml' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить трек' }));

    expect(await screen.findByText('Маршрут загружен.')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(uploadRouteMock).toHaveBeenCalledWith('ride-1', expect.any(File));
    // No mismatch note — the reload reflects the server's own auto-fill.
    expect(
      screen.queryByText(
        'Дистанция или набор высоты заезда отличаются от данных трека.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows a validation error without calling the API when no file is selected', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'draft',
      distanceKm: null,
      elevationGainMeters: null,
      route: null,
      stops: [],
    });

    render(<RouteUploadForm rideId="ride-1" />);
    await screen.findByText('Маршрут ещё не загружен');

    fireEvent.click(screen.getByRole('button', { name: 'Загрузить трек' }));

    expect(
      await screen.findByText('Выберите файл GPX для загрузки.'),
    ).toBeInTheDocument();
    expect(uploadRouteMock).not.toHaveBeenCalled();
  });

  it('shows the degraded storage-unavailable notice, not a hard error', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'draft',
      distanceKm: null,
      elevationGainMeters: null,
      route: null,
      stops: [],
    });
    uploadRouteMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/route_storage_unavailable',
        title: 'Route storage unavailable',
        status: 503,
        detail: 'File storage is temporarily unavailable. Try again shortly.',
        instance: '/v1/rides/ride-1/route',
        code: 'route_storage_unavailable',
      }),
    );

    render(<RouteUploadForm rideId="ride-1" />);
    await screen.findByText('Маршрут ещё не загружен');

    selectFile(new File(['<gpx></gpx>'], 'track.gpx'));
    fireEvent.click(screen.getByRole('button', { name: 'Загрузить трек' }));

    expect(
      await screen.findByText('Загрузка недоступна. Попробуйте ещё раз позже.'),
    ).toBeInTheDocument();
  });

  it('replaces an existing route', async () => {
    const replaced = {
      ...baseRoute,
      gpxFileName: 'new-track.gpx',
      pointCount: 200,
    };
    getRideRouteStateMock
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: baseRoute.distanceKm,
        elevationGainMeters: baseRoute.elevationGainMeters,
        route: baseRoute,
        stops: [],
      })
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: baseRoute.distanceKm,
        elevationGainMeters: baseRoute.elevationGainMeters,
        route: replaced,
        stops: [],
      });
    replaceRouteMock.mockResolvedValue(replaced);

    render(<RouteUploadForm rideId="ride-1" />);
    await screen.findByText('track.gpx', { exact: false });

    selectFile(new File(['<gpx></gpx>'], 'new-track.gpx'));
    fireEvent.click(screen.getByRole('button', { name: 'Заменить трек' }));

    expect(await screen.findByText('Маршрут обновлён.')).toBeInTheDocument();
    expect(replaceRouteMock).toHaveBeenCalledWith('ride-1', expect.any(File));
  });

  it('deletes the route after confirmation', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'draft',
      distanceKm: baseRoute.distanceKm,
      elevationGainMeters: baseRoute.elevationGainMeters,
      route: baseRoute,
      stops: [],
    });
    deleteRouteMock.mockResolvedValue(undefined);
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<RouteUploadForm rideId="ride-1" />);
    await screen.findByText('track.gpx', { exact: false });

    fireEvent.click(screen.getByRole('button', { name: 'Удалить маршрут' }));

    await waitFor(() => expect(deleteRouteMock).toHaveBeenCalledWith('ride-1'));
    expect(await screen.findByText('Маршрут удалён.')).toBeInTheDocument();
    expect(screen.getByText('Маршрут ещё не загружен')).toBeInTheDocument();
  });

  it('does not delete when the confirmation is dismissed', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'draft',
      distanceKm: baseRoute.distanceKm,
      elevationGainMeters: baseRoute.elevationGainMeters,
      route: baseRoute,
      stops: [],
    });
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<RouteUploadForm rideId="ride-1" />);
    await screen.findByText('track.gpx', { exact: false });

    fireEvent.click(screen.getByRole('button', { name: 'Удалить маршрут' }));

    expect(deleteRouteMock).not.toHaveBeenCalled();
  });

  it('hides upload/replace/delete controls for a non-draft ride, keeps the download link', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'published',
      distanceKm: baseRoute.distanceKm,
      elevationGainMeters: baseRoute.elevationGainMeters,
      route: baseRoute,
      stops: [],
    });

    render(<RouteUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Маршрут можно менять только у черновика заезда.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Заменить трек' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Скачать трек (GPX)' }),
    ).toHaveAttribute('href', '/api/v1/rides/ride-1/route/download');
  });

  it('shows a mismatch note with a sync action when the ride and track figures diverge (CR-029)', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'draft',
      distanceKm: 99.9,
      elevationGainMeters: 1234,
      route: baseRoute,
      stops: [],
    });

    render(<RouteUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Дистанция или набор высоты заезда отличаются от данных трека.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Использовать данные трека' }),
    ).toBeInTheDocument();
  });

  it('adopts the track’s figures onto the ride when the sync action is used (CR-029)', async () => {
    getRideRouteStateMock
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: 99.9,
        elevationGainMeters: 1234,
        route: baseRoute,
        stops: [],
      })
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: baseRoute.distanceKm,
        elevationGainMeters: baseRoute.elevationGainMeters,
        route: baseRoute,
        stops: [],
      });
    syncRideMetricsFromRouteMock.mockResolvedValue(undefined);

    render(<RouteUploadForm rideId="ride-1" />);
    await screen.findByRole('button', { name: 'Использовать данные трека' });

    fireEvent.click(
      screen.getByRole('button', { name: 'Использовать данные трека' }),
    );

    expect(
      await screen.findByText(
        'Дистанция и набор высоты заезда обновлены из трека.',
      ),
    ).toBeInTheDocument();
    expect(syncRideMetricsFromRouteMock).toHaveBeenCalledWith('ride-1', {
      distanceKm: baseRoute.distanceKm,
      elevationGainMeters: baseRoute.elevationGainMeters,
    });
    // The mismatch note is gone now that the reload reflects matching figures.
    expect(
      screen.queryByText(
        'Дистанция или набор высоты заезда отличаются от данных трека.',
      ),
    ).not.toBeInTheDocument();
  });

  it('shows the mismatch note but hides the sync action for a non-draft ride (CR-029)', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'published',
      distanceKm: 99.9,
      elevationGainMeters: 1234,
      route: baseRoute,
      stops: [],
    });

    render(<RouteUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Дистанция или набор высоты заезда отличаются от данных трека.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Использовать данные трека' }),
    ).not.toBeInTheDocument();
  });
});

describe('StopsSection (CR-030)', () => {
  beforeEach(() => {
    getRideRouteStateMock.mockReset();
    createStopMock.mockReset();
    updateStopMock.mockReset();
    deleteStopMock.mockReset();
  });

  it('shows the empty state and an add button for a draft ride with no stops', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'draft',
      distanceKm: null,
      elevationGainMeters: null,
      route: null,
      stops: [],
    });

    render(<RouteUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText('Остановки ещё не добавлены'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Добавить остановку' }),
    ).toBeInTheDocument();
  });

  it('lists existing stops in order', async () => {
    const second: Stop = {
      ...baseStop,
      id: 'stop-2',
      name: 'Смотровая площадка',
      position: 1,
    };
    getRideRouteStateMock.mockResolvedValue({
      status: 'draft',
      distanceKm: null,
      elevationGainMeters: null,
      route: null,
      stops: [baseStop, second],
    });

    render(<RouteUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText('Кофейня на набережной'),
    ).toBeInTheDocument();
    expect(screen.getByText('Смотровая площадка')).toBeInTheDocument();
  });

  it('adds a new stop through the form', async () => {
    getRideRouteStateMock
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: null,
        elevationGainMeters: null,
        route: null,
        stops: [],
      })
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: null,
        elevationGainMeters: null,
        route: null,
        stops: [baseStop],
      });
    createStopMock.mockResolvedValue(baseStop);

    render(<RouteUploadForm rideId="ride-1" />);
    await screen.findByText('Остановки ещё не добавлены');

    fireEvent.click(screen.getByRole('button', { name: 'Добавить остановку' }));
    fireEvent.change(screen.getByLabelText('Название'), {
      target: { value: baseStop.name },
    });
    fireEvent.change(screen.getByLabelText('Широта'), {
      target: { value: String(baseStop.lat) },
    });
    fireEvent.change(screen.getByLabelText('Долгота'), {
      target: { value: String(baseStop.lng) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(await screen.findByText('Остановка сохранена.')).toBeInTheDocument();
    expect(createStopMock).toHaveBeenCalledWith('ride-1', {
      name: baseStop.name,
      description: null,
      lat: baseStop.lat,
      lng: baseStop.lng,
      durationMinutes: null,
    });
  });

  it('deletes a stop after confirmation', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    getRideRouteStateMock
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: null,
        elevationGainMeters: null,
        route: null,
        stops: [baseStop],
      })
      .mockResolvedValueOnce({
        status: 'draft',
        distanceKm: null,
        elevationGainMeters: null,
        route: null,
        stops: [],
      });
    deleteStopMock.mockResolvedValue(undefined);

    render(<RouteUploadForm rideId="ride-1" />);
    await screen.findByText('Кофейня на набережной');

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }));

    expect(await screen.findByText('Остановка удалена.')).toBeInTheDocument();
    expect(deleteStopMock).toHaveBeenCalledWith('ride-1', baseStop.id);
    confirmSpy.mockRestore();
  });

  it('hides add/edit/delete controls for a non-draft ride', async () => {
    getRideRouteStateMock.mockResolvedValue({
      status: 'published',
      distanceKm: null,
      elevationGainMeters: null,
      route: null,
      stops: [baseStop],
    });

    render(<RouteUploadForm rideId="ride-1" />);

    expect(
      await screen.findByText('Кофейня на набережной'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Добавить остановку' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Удалить' }),
    ).not.toBeInTheDocument();
  });
});
