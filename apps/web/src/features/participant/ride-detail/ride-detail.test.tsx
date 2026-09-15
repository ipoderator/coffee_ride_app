import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride, RouteSummary, Stop } from 'types';
import { RideDetailView } from './components/RideDetailView';
import { ApiError, getRideDetail, getRouteGeometry } from './api';

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRideDetail: vi.fn(),
    getRouteGeometry: vi.fn(),
  };
});

const getRideDetailMock = vi.mocked(getRideDetail);
const getRouteGeometryMock = vi.mocked(getRouteGeometry);

const baseRoute: RouteSummary = {
  id: 'route-1',
  rideId: 'ride-1',
  gpxFileName: 'route.gpx',
  gpxFileSizeBytes: 2048,
  distanceKm: 42.3,
  elevationGainMeters: 350,
  pointCount: 3,
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
};

const baseRide: Ride = {
  id: 'ride-1',
  organizerId: 'org-1',
  title: 'Утренний гравийный заезд',
  description: 'Спокойный темп, кофе на середине маршрута.',
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
};

const baseStop: Stop = {
  id: 'stop-1',
  rideId: 'ride-1',
  name: 'Кофейня на набережной',
  description: 'Короткая остановка на кофе.',
  lat: 55.751,
  lng: 37.618,
  durationMinutes: 15,
  position: 0,
  createdAt: '2027-01-01T00:00:00.000Z',
  updatedAt: '2027-01-01T00:00:00.000Z',
  updatedBy: null,
};

describe('RideDetailView', () => {
  beforeEach(() => {
    getRideDetailMock.mockReset();
    getRouteGeometryMock.mockReset();
  });

  it('shows a not-found state for a non-existent/draft ride', async () => {
    getRideDetailMock.mockRejectedValue(
      new ApiError({
        type: 'https://coffee-ride.example/errors/ride_not_found',
        title: 'Ride not found',
        status: 404,
        detail: 'No ride with that id exists.',
        instance: '/v1/rides/unknown',
        code: 'ride_not_found',
      }),
    );

    render(<RideDetailView rideId="unknown" />);

    expect(await screen.findByText('Заезд не найден')).toBeInTheDocument();
  });

  it('shows an error state on a network/server failure', async () => {
    getRideDetailMock.mockRejectedValue(new Error('network error'));

    render(<RideDetailView rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Не удалось загрузить заезд. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the ride, organizer name, status, and every set metric', async () => {
    getRideDetailMock.mockResolvedValue({
      ride: baseRide,
      organizer: { id: 'org-1', name: 'Гравийный клуб' },
      route: null,
      stops: [],
      routePoints: [],
    });

    render(<RideDetailView rideId="ride-1" />);

    expect(await screen.findByText(baseRide.title)).toBeInTheDocument();
    expect(screen.getByText('Опубликован')).toBeInTheDocument();
    expect(screen.getByText(/Гравийный клуб/)).toBeInTheDocument();
    expect(screen.getByText(baseRide.description!)).toBeInTheDocument();
    // startsAt is 05:00 UTC; the ride's own zone is Europe/Moscow (UTC+3).
    expect(screen.getByText(/08:00/)).toBeInTheDocument();
    expect(screen.getByText('42,3')).toBeInTheDocument();
    expect(screen.getByText('350')).toBeInTheDocument();
    expect(screen.getByText('24,5')).toBeInTheDocument();
    // `formatDurationParts` joins hours/minutes with NBSP (U+00A0); Testing
    // Library's default normalizer treats it as whitespace and collapses it to a
    // plain space before matching, so the query below uses a plain space too.
    expect(screen.getByText('2 ч 30')).toBeInTheDocument();
    expect(screen.getByText('500')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('Гравийный')).toBeInTheDocument();
  });

  it('omits metric tiles for fields that are still null', async () => {
    const mockedRide: Ride = {
      ...baseRide,
      distanceKm: null,
      elevationGainMeters: null,
      paceKmh: null,
      durationMinutes: null,
      difficulty: null,
      participantLimit: null,
    };
    getRideDetailMock.mockResolvedValue({
      ride: mockedRide,
      organizer: { id: 'org-1', name: 'Гравийный клуб' },
      route: null,
      stops: [],
      routePoints: [],
    });

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    expect(screen.queryByText('Дистанция')).not.toBeInTheDocument();
    expect(screen.queryByText('Набор высоты')).not.toBeInTheDocument();
    expect(screen.queryByText('Средний темп')).not.toBeInTheDocument();
    expect(screen.queryByText('Длительность')).not.toBeInTheDocument();
    expect(screen.queryByText('Лимит участников')).not.toBeInTheDocument();
  });

  it('omits the "Маршрут" section entirely when no route has been uploaded', async () => {
    getRideDetailMock.mockResolvedValue({
      ride: baseRide,
      organizer: { id: 'org-1', name: 'Гравийный клуб' },
      route: null,
      stops: [],
      routePoints: [],
    });

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    expect(screen.queryByText('Маршрут')).not.toBeInTheDocument();
    expect(getRouteGeometryMock).not.toHaveBeenCalled();
  });

  it('shows the route map placeholder and elevation profile once a route exists', async () => {
    getRideDetailMock.mockResolvedValue({
      ride: baseRide,
      organizer: { id: 'org-1', name: 'Гравийный клуб' },
      route: baseRoute,
      stops: [],
      routePoints: [],
    });
    getRouteGeometryMock.mockResolvedValue({
      points: [
        { lat: 55.75, lng: 37.6, elevationMeters: 100 },
        { lat: 55.7545, lng: 37.6, elevationMeters: 150 },
        { lat: 55.759, lng: 37.6, elevationMeters: 120 },
      ],
    });

    render(<RideDetailView rideId="ride-1" />);

    expect(await screen.findByText('Маршрут')).toBeInTheDocument();
    expect(getRouteGeometryMock).toHaveBeenCalledWith('ride-1');
    // Degraded map placeholder (KI-031, no live 2GIS credential) — always shown.
    expect(
      await screen.findByText('Карта маршрута временно недоступна.'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByRole('img', { name: /Профиль высоты/ }),
      ).toBeInTheDocument();
    });
  });

  it('shows a retryable degraded state when the geometry fetch fails', async () => {
    getRideDetailMock.mockResolvedValue({
      ride: baseRide,
      organizer: { id: 'org-1', name: 'Гравийный клуб' },
      route: baseRoute,
      stops: [],
      routePoints: [],
    });
    getRouteGeometryMock.mockRejectedValue(new Error('network error'));

    render(<RideDetailView rideId="ride-1" />);

    expect(
      await screen.findByText(
        'Не удалось загрузить профиль высоты. Попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    // The rest of the page (title, other metrics) stays intact — a route-render
    // failure degrades locally, it does not blank the page.
    expect(screen.getByText(baseRide.title)).toBeInTheDocument();
  });

  it('renders stops in order, and omits the section entirely when there are none', async () => {
    getRideDetailMock.mockResolvedValue({
      ride: baseRide,
      organizer: { id: 'org-1', name: 'Гравийный клуб' },
      route: null,
      stops: [
        baseStop,
        {
          ...baseStop,
          id: 'stop-2',
          name: 'Смотровая площадка',
          description: null,
          position: 1,
        },
      ],
      routePoints: [],
    });

    render(<RideDetailView rideId="ride-1" />);

    expect(await screen.findByText('Остановки')).toBeInTheDocument();
    expect(screen.getByText(/1\. Кофейня на набережной/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Смотровая площадка/)).toBeInTheDocument();
    expect(screen.getByText('Короткая остановка на кофе.')).toBeInTheDocument();
  });

  it('omits the "Остановки" section entirely when there are no stops', async () => {
    getRideDetailMock.mockResolvedValue({
      ride: baseRide,
      organizer: { id: 'org-1', name: 'Гравийный клуб' },
      route: null,
      stops: [],
      routePoints: [],
    });

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    expect(screen.queryByText('Остановки')).not.toBeInTheDocument();
  });
});
