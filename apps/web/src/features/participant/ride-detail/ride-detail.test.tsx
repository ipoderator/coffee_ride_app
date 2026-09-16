import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GetRideResponse, Ride, RouteSummary, Stop } from 'types';
import { RideDetailView } from './components/RideDetailView';
import {
  ApiError,
  getRideDetail,
  getRideReviews,
  getRouteGeometry,
} from './api';

// `RegistrationButton` calls `useRouter()` (redirect-to-login on a 401) — same
// mocking precedent as `features/auth/login/login.test.tsx`, RTL's `render()` doesn't
// mount a real Next.js App Router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRideDetail: vi.fn(),
    getRouteGeometry: vi.fn(),
    getRideReviews: vi.fn(),
  };
});

const getRideDetailMock = vi.mocked(getRideDetail);
const getRouteGeometryMock = vi.mocked(getRouteGeometry);
const getRideReviewsMock = vi.mocked(getRideReviews);

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

// CR-032 ("Register"): every fixture below is `published`, not `registration_open`,
// so `RegistrationButton` renders nothing (`rideStatus !== 'registration_open' &&
// !viewerRegistration`) unless a test opts in — keeps every pre-existing assertion
// in this file about other sections unaffected by the new button.
function baseDetailResponse(
  overrides: Partial<GetRideResponse> = {},
): GetRideResponse {
  return {
    ride: baseRide,
    organizer: {
      id: 'org-1',
      name: 'Гравийный клуб',
      rating: null,
      reviewCount: 0,
    },
    route: null,
    stops: [],
    routePoints: [],
    registrationsCount: 0,
    viewerRegistration: null,
    viewerWaitlistEntry: null,
    viewerReview: null,
    ...overrides,
  };
}

describe('RideDetailView', () => {
  beforeEach(() => {
    getRideDetailMock.mockReset();
    getRouteGeometryMock.mockReset();
    getRideReviewsMock.mockReset();
    getRideReviewsMock.mockResolvedValue({ items: [], nextCursor: null });
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
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({ registrationsCount: 12 }),
    );

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
    // CR-032: the participant-limit tile is now a registered/capacity ratio
    // (`formatParticipantsParts`), same NBSP-as-plain-space normalization as above.
    expect(screen.getByText('12 из 20')).toBeInTheDocument();
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
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({ ride: mockedRide }),
    );

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    expect(screen.queryByText('Дистанция')).not.toBeInTheDocument();
    expect(screen.queryByText('Набор высоты')).not.toBeInTheDocument();
    expect(screen.queryByText('Средний темп')).not.toBeInTheDocument();
    expect(screen.queryByText('Длительность')).not.toBeInTheDocument();
    expect(screen.queryByText('Участники')).not.toBeInTheDocument();
  });

  it('omits the "Маршрут" section entirely when no route has been uploaded', async () => {
    getRideDetailMock.mockResolvedValue(baseDetailResponse());

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    expect(screen.queryByText('Маршрут')).not.toBeInTheDocument();
    expect(getRouteGeometryMock).not.toHaveBeenCalled();
  });

  it('shows the route map placeholder and elevation profile once a route exists', async () => {
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({ route: baseRoute }),
    );
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
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({ route: baseRoute }),
    );
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
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({
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
      }),
    );

    render(<RideDetailView rideId="ride-1" />);

    expect(await screen.findByText('Остановки')).toBeInTheDocument();
    expect(screen.getByText(/1\. Кофейня на набережной/)).toBeInTheDocument();
    expect(screen.getByText(/2\. Смотровая площадка/)).toBeInTheDocument();
    expect(screen.getByText('Короткая остановка на кофе.')).toBeInTheDocument();
  });

  it('omits the "Остановки" section entirely when there are no stops', async () => {
    getRideDetailMock.mockResolvedValue(baseDetailResponse());

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    expect(screen.queryByText('Остановки')).not.toBeInTheDocument();
  });

  describe('registration action', () => {
    it('is hidden while registration is not open and the viewer has no registration', async () => {
      getRideDetailMock.mockResolvedValue(baseDetailResponse());

      render(<RideDetailView rideId="ride-1" />);

      await screen.findByText(baseRide.title);
      expect(screen.queryByText('Зарегистрироваться')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Отменить регистрацию'),
      ).not.toBeInTheDocument();
    });

    it('offers registration once registration is open', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      expect(await screen.findByText('Зарегистрироваться')).toBeInTheDocument();
    });

    it('offers joining the waitlist once capacity is reached', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: {
            ...baseRide,
            status: 'registration_open',
            participantLimit: 5,
          },
          registrationsCount: 5,
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const button = await screen.findByText('Встать в список ожидания');
      expect(button.closest('button')).not.toBeDisabled();
    });

    it('shows the waitlisted state and a leave-waitlist action when the viewer is queued, even once registration has closed', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_closed' },
          viewerWaitlistEntry: {
            id: 'waitlist-entry-1',
            rideId: 'ride-1',
            userId: 'user-1',
            status: 'waiting',
            createdAt: '2027-01-01T00:00:00.000Z',
            updatedAt: '2027-01-01T00:00:00.000Z',
            cancelledAt: null,
            promotedAt: null,
          },
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const waitlistedLabel = await screen.findByText('В списке ожидания');
      expect(waitlistedLabel.closest('button')).toBeDisabled();
      expect(screen.getByText('Покинуть список ожидания')).toBeInTheDocument();
    });

    it('offers cancellation when the viewer already has an active registration, even once registration has closed', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_closed' },
          registrationsCount: 1,
          viewerRegistration: {
            id: 'registration-1',
            rideId: 'ride-1',
            userId: 'user-1',
            status: 'active',
            createdAt: '2027-01-01T00:00:00.000Z',
            updatedAt: '2027-01-01T00:00:00.000Z',
            cancelledAt: null,
          },
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      expect(
        await screen.findByText('Отменить регистрацию'),
      ).toBeInTheDocument();
    });
  });

  describe('reviews (CR-042/CR-043)', () => {
    const activeRegistration = {
      id: 'registration-1',
      rideId: 'ride-1',
      userId: 'user-1',
      status: 'active' as const,
      createdAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2027-01-01T00:00:00.000Z',
      cancelledAt: null,
    };

    it('shows no reviews section before the ride is finished', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({ ride: { ...baseRide, status: 'started' } }),
      );

      render(<RideDetailView rideId="ride-1" />);

      await screen.findByText(baseRide.title);
      expect(screen.queryByText('Отзывы')).not.toBeInTheDocument();
      expect(getRideReviewsMock).not.toHaveBeenCalled();
    });

    it('shows the review form for an eligible participant who has not reviewed yet', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'finished' },
          viewerRegistration: activeRegistration,
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      expect(await screen.findByText('Отзывы')).toBeInTheDocument();
      expect(screen.getByText('Оставить отзыв')).toBeInTheDocument();
    });

    it('hides the review form once the viewer has already reviewed', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'finished' },
          viewerRegistration: activeRegistration,
          viewerReview: {
            id: 'review-1',
            rideId: 'ride-1',
            userId: 'user-1',
            authorName: 'Иван',
            rating: 5,
            comment: null,
            createdAt: '2027-06-01T00:00:00.000Z',
          },
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      await screen.findByText('Отзывы');
      expect(screen.queryByText('Оставить отзыв')).not.toBeInTheDocument();
    });

    it('hides the review form for a non-participant and lists existing reviews', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({ ride: { ...baseRide, status: 'finished' } }),
      );
      getRideReviewsMock.mockResolvedValue({
        items: [
          {
            id: 'review-1',
            rideId: 'ride-1',
            userId: 'user-2',
            authorName: 'Мария',
            rating: 4,
            comment: 'Отличный заезд!',
            createdAt: '2027-06-01T00:00:00.000Z',
          },
        ],
        nextCursor: null,
      });

      render(<RideDetailView rideId="ride-1" />);

      await screen.findByText('Отзывы');
      expect(screen.queryByText('Оставить отзыв')).not.toBeInTheDocument();
      expect(await screen.findByText('Мария')).toBeInTheDocument();
      expect(screen.getByText('Отличный заезд!')).toBeInTheDocument();
    });

    it('shows the organizer rating next to the organizer name once they have reviews', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          organizer: {
            id: 'org-1',
            name: 'Гравийный клуб',
            rating: 4.5,
            reviewCount: 3,
          },
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      await screen.findByText(baseRide.title);
      // `★` is unique to the rating text — plain `/4,5/` would also match the
      // unrelated "24,5 км/ч" pace tile elsewhere on the page.
      const organizerLine = screen.getByText(/★/);
      expect(organizerLine.textContent).toContain('4,5');
      expect(organizerLine.textContent).toContain('3 отзыва');
    });
  });
});
