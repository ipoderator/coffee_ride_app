import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  GetRideResponse,
  Registration,
  Ride,
  RideGroupSummary,
  RoutePoint,
  RouteSummary,
  Stop,
} from 'types';
import { ToastProvider } from 'ui';
import { RideDetailView } from './components/RideDetailView';
import {
  ApiError,
  cancelRideRegistration,
  changeRegistrationGroup,
  getRideDetail,
  getRideReviews,
  getRideRiders,
  getRouteGeometry,
  joinRideWaitlist,
  registerForRide,
} from './api';

// `RegistrationButton` calls `useRouter()` (redirect-to-login on a 401) — same
// mocking precedent as `features/auth/login/login.test.tsx`, RTL's `render()` doesn't
// mount a real Next.js App Router.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// CR-119: `RidersSection` reads the shared session (`SessionProvider` in the
// root layout) to skip a guaranteed-401 riders request for anonymous visitors.
// Anonymous by default; a test flips it to exercise the signed-in list.
const sessionState: {
  status: 'loading' | 'authenticated' | 'anonymous' | 'error';
} = { status: 'anonymous' };
vi.mock('@/lib/auth/session-context', () => ({
  useSession: () => ({
    status: sessionState.status,
    user: null,
    refresh: vi.fn(),
  }),
}));

vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return {
    ...actual,
    getRideDetail: vi.fn(),
    getRouteGeometry: vi.fn(),
    getRideReviews: vi.fn(),
    registerForRide: vi.fn(),
    cancelRideRegistration: vi.fn(),
    changeRegistrationGroup: vi.fn(),
    joinRideWaitlist: vi.fn(),
    getRideRiders: vi.fn(),
  };
});

const getRideDetailMock = vi.mocked(getRideDetail);
const getRouteGeometryMock = vi.mocked(getRouteGeometry);
const getRideReviewsMock = vi.mocked(getRideReviews);
const registerForRideMock = vi.mocked(registerForRide);
const cancelRideRegistrationMock = vi.mocked(cancelRideRegistration);
const changeRegistrationGroupMock = vi.mocked(changeRegistrationGroup);
const joinRideWaitlistMock = vi.mocked(joinRideWaitlist);
const getRideRidersMock = vi.mocked(getRideRiders);

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
      avatarUrl: null,
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
    groups: [],
    ...overrides,
  };
}

function activeRegistration(
  overrides: Partial<Registration> = {},
): Registration {
  return {
    id: 'registration-1',
    rideId: 'ride-1',
    userId: 'user-1',
    status: 'active',
    groupId: null,
    createdAt: '2027-01-01T00:00:00.000Z',
    updatedAt: '2027-01-01T00:00:00.000Z',
    cancelledAt: null,
    ...overrides,
  };
}

const groupOne: RideGroupSummary = {
  id: 'group-1',
  name: 'Группа 1',
  paceKmh: 25,
  description: null,
  position: 0,
  registrationsCount: 7,
};
const groupTwo: RideGroupSummary = {
  id: 'group-2',
  name: 'Группа 2',
  paceKmh: 35,
  description: null,
  position: 1,
  registrationsCount: 1,
};

function groupProblem(code: string, status = 422): ApiError {
  return new ApiError({
    type: `https://coffee-ride.example/errors/${code}`,
    title: code,
    status,
    detail: code,
    instance: '/v1/rides/ride-1/register',
    code,
  });
}

describe('RideDetailView', () => {
  beforeEach(() => {
    getRideDetailMock.mockReset();
    getRouteGeometryMock.mockReset();
    getRideReviewsMock.mockReset();
    getRideReviewsMock.mockResolvedValue({ items: [], nextCursor: null });
    registerForRideMock.mockReset();
    cancelRideRegistrationMock.mockReset();
    changeRegistrationGroupMock.mockReset();
    joinRideWaitlistMock.mockReset();
    getRideRidersMock.mockReset();
    getRideRidersMock.mockResolvedValue({ items: [], nextCursor: null });
    sessionState.status = 'anonymous';
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
    // CR-119: «Участники» is also the riders section's heading now — the
    // participants *fact* is what must be absent without a limit.
    expect(
      within(screen.getByTestId('ride-facts')).queryByText('Участники'),
    ).not.toBeInTheDocument();
  });

  it('omits the "Маршрут" section entirely when no route has been uploaded', async () => {
    getRideDetailMock.mockResolvedValue(baseDetailResponse());

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    expect(screen.queryByText('Маршрут')).not.toBeInTheDocument();
    expect(getRouteGeometryMock).not.toHaveBeenCalled();
  });

  it('omits the map panel entirely when there is nothing to put on a map', async () => {
    getRideDetailMock.mockResolvedValue(baseDetailResponse());

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    // Regression: an empty panel used to reserve ~55% of the viewport for
    // nothing (confirmed live via a route/stops-less ride).
    expect(screen.queryByText('Место старта')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Карта маршрута временно недоступна.'),
    ).not.toBeInTheDocument();
  });

  it('shows a start-location map panel for a ride with a start point but no route', async () => {
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({
        ride: { ...baseRide, startLat: 55.75, startLng: 37.61 },
      }),
    );

    render(<RideDetailView rideId="ride-1" />);

    expect(await screen.findByText('Место старта')).toBeInTheDocument();
    expect(screen.queryByText('Маршрут')).not.toBeInTheDocument();
    expect(getRouteGeometryMock).not.toHaveBeenCalled();
    // No MapGL key in the test env — the degraded placeholder, never a blank box.
    expect(
      await screen.findByText('Карта маршрута временно недоступна.'),
    ).toBeInTheDocument();
    // No route → no elevation profile section either.
    expect(screen.queryByText('Профиль высоты')).not.toBeInTheDocument();
  });

  it('shows the map panel once stops exist, even without a route', async () => {
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({ stops: [baseStop] }),
    );

    render(<RideDetailView rideId="ride-1" />);

    expect(await screen.findByText('Место старта')).toBeInTheDocument();
    expect(screen.getByText(/1\. Кофейня на набережной/)).toBeInTheDocument();
  });

  it('shows price and bike type as supporting facts next to the headline metrics', async () => {
    getRideDetailMock.mockResolvedValue(baseDetailResponse());

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    expect(screen.getByText('Тип велосипеда')).toBeInTheDocument();
    expect(screen.getByText('Стоимость участия')).toBeInTheDocument();
    expect(screen.getByText('₽')).toBeInTheDocument();
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
            groupId: null,
            createdAt: '2027-01-01T00:00:00.000Z',
            updatedAt: '2027-01-01T00:00:00.000Z',
            cancelledAt: null,
            promotedAt: null,
          },
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      // CR-119: a status badge, not a disabled button posing as one.
      const waitlistedLabel = await screen.findByText('В списке ожидания');
      expect(waitlistedLabel.closest('button')).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Покинуть список ожидания' }),
      ).toBeInTheDocument();
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
            groupId: null,
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

    // CR-103 (`/impeccable critique` P0): confirm-before-cancel + success toasts.
    it('shows a success toast after registering, with no confirm dialog', async () => {
      registerForRideMock.mockResolvedValue({
        registration: {
          id: 'registration-1',
          rideId: 'ride-1',
          userId: 'user-1',
          status: 'active',
          groupId: null,
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-01T00:00:00.000Z',
          cancelledAt: null,
        },
      });
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
        }),
      );

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      fireEvent.click(await screen.findByText('Зарегистрироваться'));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        await screen.findByText('Вы зарегистрированы на заезд.'),
      ).toBeInTheDocument();
      expect(registerForRideMock).toHaveBeenCalledWith('ride-1');
    });

    it('requires confirmation before cancelling, and does not call the API until confirmed', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          registrationsCount: 1,
          viewerRegistration: {
            id: 'registration-1',
            rideId: 'ride-1',
            userId: 'user-1',
            status: 'active',
            groupId: null,
            createdAt: '2027-01-01T00:00:00.000Z',
            updatedAt: '2027-01-01T00:00:00.000Z',
            cancelledAt: null,
          },
        }),
      );

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      fireEvent.click(await screen.findByText('Отменить регистрацию'));

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Отменить регистрацию?')).toBeInTheDocument();
      expect(cancelRideRegistrationMock).not.toHaveBeenCalled();

      // Dismissing the dialog via "Остаться" must not cancel the registration.
      fireEvent.click(screen.getByRole('button', { name: 'Остаться' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(cancelRideRegistrationMock).not.toHaveBeenCalled();
    });

    it('cancels and shows a success toast once the confirm dialog is confirmed', async () => {
      cancelRideRegistrationMock.mockResolvedValue(undefined);
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          registrationsCount: 1,
          viewerRegistration: {
            id: 'registration-1',
            rideId: 'ride-1',
            userId: 'user-1',
            status: 'active',
            groupId: null,
            createdAt: '2027-01-01T00:00:00.000Z',
            updatedAt: '2027-01-01T00:00:00.000Z',
            cancelledAt: null,
          },
        }),
      );

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      fireEvent.click(await screen.findByText('Отменить регистрацию'));
      const dialog = await screen.findByRole('dialog');
      // The underlying button and the dialog's confirm button share this label —
      // `within(dialog)` scopes to the confirm dialog's own copy.
      fireEvent.click(
        within(dialog).getByRole('button', { name: 'Отменить регистрацию' }),
      );

      await waitFor(() => {
        expect(cancelRideRegistrationMock).toHaveBeenCalledWith('ride-1');
      });
      expect(
        await screen.findByText('Регистрация отменена.'),
      ).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    // CR-105's sticky mobile registration bar — the default since CR-119
    // (`FEATURE_STICKY_REGISTRATION_CTA` removed).
    it('renders the register action in the fixed bottom bar, with no flag', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          registrationsCount: 14,
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const button = await screen.findByRole('button', {
        name: 'Зарегистрироваться',
      });
      const bar = button.closest('div[class*="fixed"]');
      expect(bar).toBeInTheDocument();
      // Seats left sit above the button inside the same bar.
      expect(
        within(bar as HTMLElement).getByText('Осталось 6 мест'),
      ).toBeInTheDocument();
    });

    it("keeps a registered viewer's block in the flow, not in the fixed bar", async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          registrationsCount: 1,
          viewerRegistration: activeRegistration(),
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const cancel = await screen.findByRole('button', {
        name: 'Отменить регистрацию',
      });
      expect(cancel.closest('div[class*="fixed"]')).not.toBeInTheDocument();
    });
  });

  describe('reviews (CR-042/CR-043)', () => {
    const activeRegistration = {
      id: 'registration-1',
      rideId: 'ride-1',
      userId: 'user-1',
      status: 'active' as const,
      groupId: null,
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
            avatarUrl: null,
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
  describe('pace groups (CR-119)', () => {
    const openWithGroups = (overrides: Partial<GetRideResponse> = {}) =>
      baseDetailResponse({
        ride: { ...baseRide, status: 'registration_open' },
        groups: [groupOne, groupTwo],
        registrationsCount: 8,
        ...overrides,
      });

    it('lists the groups as a radio group and keeps registration disabled until one is chosen', async () => {
      getRideDetailMock.mockResolvedValue(openWithGroups());

      render(<RideDetailView rideId="ride-1" />);

      const picker = await screen.findByRole('group', {
        name: 'Выберите группу',
      });
      const radios = within(picker).getAllByRole('radio');
      expect(radios).toHaveLength(2);
      expect(within(picker).getByText('Группа 1')).toBeInTheDocument();
      expect(within(picker).getByText('7 участников')).toBeInTheDocument();
      expect(within(picker).getByText('1 участник')).toBeInTheDocument();
      // Group pace in the compact form: «25 км/ч», not «25,0».
      expect(within(picker).getByText('25')).toBeInTheDocument();

      const button = screen.getByRole('button', { name: 'Зарегистрироваться' });
      expect(button).toBeDisabled();
      expect(
        screen.getByText('Выберите группу, чтобы записаться'),
      ).toBeInTheDocument();

      fireEvent.click(within(picker).getByRole('radio', { name: /Группа 1/ }));

      expect(button).not.toBeDisabled();
      expect(
        screen.queryByText('Выберите группу, чтобы записаться'),
      ).not.toBeInTheDocument();
    });

    it('sends the chosen groupId when registering', async () => {
      getRideDetailMock.mockResolvedValue(openWithGroups());
      registerForRideMock.mockResolvedValue({
        registration: activeRegistration({ groupId: 'group-2' }),
      });

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      fireEvent.click(await screen.findByRole('radio', { name: /Группа 2/ }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Зарегистрироваться' }),
      );

      await waitFor(() => {
        expect(registerForRideMock).toHaveBeenCalledWith('ride-1', 'group-2');
      });
      expect(
        await screen.findByText('Вы едете в группе «Группа 2» · 35 км/ч'),
      ).toBeInTheDocument();
    });

    it('sends the chosen groupId when joining the waitlist of a full ride', async () => {
      getRideDetailMock.mockResolvedValue(
        openWithGroups({
          ride: {
            ...baseRide,
            status: 'registration_open',
            participantLimit: 8,
          },
        }),
      );
      joinRideWaitlistMock.mockResolvedValue({
        waitlistEntry: {
          id: 'waitlist-entry-1',
          rideId: 'ride-1',
          userId: 'user-1',
          status: 'waiting',
          groupId: 'group-1',
          createdAt: '2027-01-01T00:00:00.000Z',
          updatedAt: '2027-01-01T00:00:00.000Z',
          cancelledAt: null,
          promotedAt: null,
        },
      });

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      expect(await screen.findByText('Мест не осталось')).toBeInTheDocument();
      const join = screen.getByRole('button', {
        name: 'Встать в список ожидания',
      });
      expect(join).toBeDisabled();
      fireEvent.click(screen.getByRole('radio', { name: /Группа 1/ }));
      fireEvent.click(join);

      await waitFor(() => {
        expect(joinRideWaitlistMock).toHaveBeenCalledWith('ride-1', 'group-1');
      });
    });

    it('keeps the body-less register call for a ride without groups', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
        }),
      );
      registerForRideMock.mockResolvedValue({
        registration: activeRegistration(),
      });

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      expect(screen.queryByRole('radio')).not.toBeInTheDocument();
      fireEvent.click(
        await screen.findByRole('button', { name: 'Зарегистрироваться' }),
      );
      await waitFor(() => {
        expect(registerForRideMock).toHaveBeenCalledTimes(1);
      });
      expect(registerForRideMock.mock.calls[0]).toEqual(['ride-1']);
    });

    it.each([
      ['group_required', 'Чтобы записаться, выберите группу.'],
      [
        'group_not_found',
        'Этой группы больше нет в заезде. Обновите страницу и выберите другую.',
      ],
    ])('maps a 422 %s to a clear message', async (code, message) => {
      getRideDetailMock.mockResolvedValue(openWithGroups());
      registerForRideMock.mockRejectedValue(groupProblem(code));

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      fireEvent.click(await screen.findByRole('radio', { name: /Группа 1/ }));
      fireEvent.click(
        screen.getByRole('button', { name: 'Зарегистрироваться' }),
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
    });

    it('shows the pace range across groups as the pace metric', async () => {
      getRideDetailMock.mockResolvedValue(openWithGroups());

      render(<RideDetailView rideId="ride-1" />);

      await screen.findByText(baseRide.title);
      expect(screen.getByText('25–35')).toBeInTheDocument();
      // The ride's own single `paceKmh` is superseded by the groups' range.
      expect(screen.queryByText('24,5')).not.toBeInTheDocument();
    });
  });

  describe('registered state (CR-119)', () => {
    const startPoint: RoutePoint = {
      id: 'rp-start',
      rideId: 'ride-1',
      type: 'start',
      label: 'Кофейня «Зерно»',
      description: null,
      lat: 55.75,
      lng: 37.61,
      createdAt: '2027-01-01T00:00:00.000Z',
      updatedAt: '2027-01-01T00:00:00.000Z',
      updatedBy: null,
    };

    it('shows «Вы зарегистрированы» with when, start and group, and a danger-outline cancel', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          groups: [groupOne, groupTwo],
          routePoints: [startPoint],
          registrationsCount: 8,
          viewerRegistration: activeRegistration({ groupId: 'group-1' }),
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const block = (
        await screen.findByRole('heading', { name: 'Вы зарегистрированы' })
      ).closest('section') as HTMLElement;
      expect(within(block).getByText(/08:00/)).toBeInTheDocument();
      expect(within(block).getByText(/МСК/)).toBeInTheDocument();
      expect(within(block).getByText('Кофейня «Зерно»')).toBeInTheDocument();
      expect(
        within(block).getByText('Вы едете в группе «Группа 1» · 25 км/ч'),
      ).toBeInTheDocument();
      const cancel = within(block).getByRole('button', {
        name: 'Отменить регистрацию',
      });
      expect(cancel.className).toContain('border-danger');
      expect(cancel.className).not.toContain('bg-danger ');
      // No second «Группы» picker next to the registered block.
      expect(
        screen.queryByRole('group', { name: 'Выберите группу' }),
      ).not.toBeInTheDocument();
      // The start point label is also on the page header.
      expect(screen.getAllByText('Кофейня «Зерно»').length).toBeGreaterThan(1);
    });

    it('changes group via PATCH', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          groups: [groupOne, groupTwo],
          registrationsCount: 8,
          viewerRegistration: activeRegistration({ groupId: 'group-1' }),
        }),
      );
      changeRegistrationGroupMock.mockResolvedValue({
        registration: activeRegistration({ groupId: 'group-2' }),
      });

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      fireEvent.click(
        await screen.findByRole('button', { name: 'Сменить группу' }),
      );
      const picker = screen.getByRole('group', { name: 'Сменить группу' });
      const save = screen.getByRole('button', { name: 'Сохранить' });
      // The current group is preselected — saving it again is a no-op.
      expect(
        within(picker).getByRole('radio', { name: /Группа 1/ }),
      ).toBeChecked();
      expect(save).toBeDisabled();

      fireEvent.click(within(picker).getByRole('radio', { name: /Группа 2/ }));
      fireEvent.click(save);

      await waitFor(() => {
        expect(changeRegistrationGroupMock).toHaveBeenCalledWith(
          'ride-1',
          'group-2',
        );
      });
      expect(await screen.findByText('Группа изменена.')).toBeInTheDocument();
      expect(
        screen.getByText('Вы едете в группе «Группа 2» · 35 км/ч'),
      ).toBeInTheDocument();
    });

    it('maps a failed group change to a clear message', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          groups: [groupOne, groupTwo],
          viewerRegistration: activeRegistration({ groupId: 'group-1' }),
        }),
      );
      changeRegistrationGroupMock.mockRejectedValue(
        groupProblem('group_not_found'),
      );

      render(<RideDetailView rideId="ride-1" />);

      fireEvent.click(
        await screen.findByRole('button', { name: 'Сменить группу' }),
      );
      fireEvent.click(screen.getByRole('radio', { name: /Группа 2/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Этой группы больше нет в заезде.',
      );
    });

    it('prompts a viewer registered without a group to choose one', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          groups: [groupOne, groupTwo],
          viewerRegistration: activeRegistration({ groupId: null }),
        }),
      );
      changeRegistrationGroupMock.mockResolvedValue({
        registration: activeRegistration({ groupId: 'group-1' }),
      });

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      const picker = await screen.findByRole('group', {
        name: 'Выберите группу',
      });
      expect(
        screen.queryByRole('button', { name: 'Сменить группу' }),
      ).not.toBeInTheDocument();
      fireEvent.click(within(picker).getByRole('radio', { name: /Группа 1/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

      await waitFor(() => {
        expect(changeRegistrationGroupMock).toHaveBeenCalledWith(
          'ride-1',
          'group-1',
        );
      });
    });
  });

  describe('«Участники» (CR-119)', () => {
    it('shows only the count and a sign-in link to anonymous viewers, without requesting the list', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({ registrationsCount: 14 }),
      );

      render(<RideDetailView rideId="ride-1" />);

      expect(
        await screen.findByRole('link', {
          name: 'Войдите, чтобы увидеть список',
        }),
      ).toHaveAttribute('href', '/login');
      expect(screen.getByText('14 участников')).toBeInTheDocument();
      expect(getRideRidersMock).not.toHaveBeenCalled();
    });

    it('lists signed-in viewers the riders grouped by group, ungrouped last', async () => {
      sessionState.status = 'authenticated';
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          groups: [
            { ...groupOne, registrationsCount: 2 },
            { ...groupTwo, registrationsCount: 1 },
          ],
          registrationsCount: 4,
        }),
      );
      getRideRidersMock.mockResolvedValue({
        items: [
          {
            displayName: 'Анна',
            group: { id: 'group-1', name: 'Группа 1', paceKmh: 25 },
          },
          {
            displayName: null,
            group: { id: 'group-1', name: 'Группа 1', paceKmh: 25 },
          },
          {
            displayName: 'Борис',
            group: { id: 'group-2', name: 'Группа 2', paceKmh: 35 },
          },
          { displayName: 'Вера', group: null },
        ],
        nextCursor: null,
      });

      render(<RideDetailView rideId="ride-1" />);

      // `findByText`, not a role query: the pace joins value and unit with an
      // NBSP, which the text matcher's normalizer collapses and the
      // accessible-name matcher does not.
      const headingOne = await screen.findByText('Группа 1 · 25 км/ч — 2');
      const headings = screen
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent?.replace(/\s+/g, ' '));
      expect(headings).toEqual([
        'Группа 1 · 25 км/ч — 2',
        'Группа 2 · 35 км/ч — 1',
        'Без группы — 1',
      ]);
      const groupOneList = headingOne.parentElement as HTMLElement;
      expect(within(groupOneList).getByText('Анна')).toBeInTheDocument();
      expect(
        within(groupOneList).getByText('Участник без имени'),
      ).toBeInTheDocument();
      expect(screen.getByText('Вера')).toBeInTheDocument();
      expect(getRideRidersMock).toHaveBeenCalledWith('ride-1');
    });

    it('falls back to the sign-in prompt on a 401 from the riders endpoint', async () => {
      sessionState.status = 'authenticated';
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({ registrationsCount: 3 }),
      );
      getRideRidersMock.mockRejectedValue(groupProblem('unauthorized', 401));

      render(<RideDetailView rideId="ride-1" />);

      expect(
        await screen.findByRole('link', {
          name: 'Войдите, чтобы увидеть список',
        }),
      ).toBeInTheDocument();
    });

    it('shows a retryable error when the list fails to load', async () => {
      sessionState.status = 'authenticated';
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({ registrationsCount: 3 }),
      );
      getRideRidersMock.mockRejectedValue(new Error('network error'));

      render(<RideDetailView rideId="ride-1" />);

      expect(
        await screen.findByText(
          'Не удалось загрузить список участников. Попробуйте ещё раз.',
        ),
      ).toBeInTheDocument();
    });

    it('shows an empty state when nobody has registered yet', async () => {
      sessionState.status = 'authenticated';
      getRideDetailMock.mockResolvedValue(baseDetailResponse());

      render(<RideDetailView rideId="ride-1" />);

      expect(
        await screen.findByText('Пока никто не записался'),
      ).toBeInTheDocument();
    });

    it('loads the next page with «Показать ещё»', async () => {
      sessionState.status = 'authenticated';
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({ registrationsCount: 2 }),
      );
      getRideRidersMock
        .mockResolvedValueOnce({
          items: [{ displayName: 'Анна', group: null }],
          nextCursor: 'cursor-2',
        })
        .mockResolvedValueOnce({
          items: [{ displayName: 'Борис', group: null }],
          nextCursor: null,
        });

      render(<RideDetailView rideId="ride-1" />);

      expect(await screen.findByText('Анна')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Показать ещё' }));

      expect(await screen.findByText('Борис')).toBeInTheDocument();
      expect(getRideRidersMock).toHaveBeenLastCalledWith('ride-1', 'cursor-2');
      expect(
        screen.queryByRole('button', { name: 'Показать ещё' }),
      ).not.toBeInTheDocument();
    });
  });

  it('offers the GPX download once a route exists', async () => {
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({ route: baseRoute }),
    );
    getRouteGeometryMock.mockResolvedValue({ points: [] });

    render(<RideDetailView rideId="ride-1" />);

    expect(
      await screen.findByRole('link', { name: 'Скачать GPX' }),
    ).toHaveAttribute('href', '/api/v1/rides/ride-1/route/download');
  });

  it('shows the start line with weekday, time and zone hint', async () => {
    getRideDetailMock.mockResolvedValue(baseDetailResponse());

    render(<RideDetailView rideId="ride-1" />);

    // 2027-05-01T05:00Z is Saturday 08:00 in Moscow.
    expect(
      await screen.findByText(/сб 1 мая 2027 · 08:00 · МСК/),
    ).toBeInTheDocument();
  });
});
