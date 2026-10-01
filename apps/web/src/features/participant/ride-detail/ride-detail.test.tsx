import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

// `RegistrationTicket` calls `useRouter()` (redirect-to-login on a 401) — same
// mocking precedent as `features/auth/login/login.test.tsx`, RTL's `render()` doesn't
// mount a real Next.js App Router.
const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
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
  participantsVisible: true,
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
// so the ticket shows «Регистрация ещё не открыта» with no action (CR-151)
// unless a test opts in.
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
    isOwner: false,
    waitlistCount: 0,
    viewerStartNumber: null,
    viewerWaitlistPosition: null,
    requirements: [],
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
    // KI-070: `createMapRenderer()` reads this at call time, so a shell that
    // sourced `.env` (a real MapGL key) would make these tests try the real
    // 2GIS render instead of the degraded placeholder they assert on. Own the
    // precondition here instead of relying on the shell being clean.
    vi.stubEnv('NEXT_PUBLIC_MAPS_2GIS_MAPGL_KEY', '');
    getRideDetailMock.mockReset();
    getRouteGeometryMock.mockReset();
    getRideReviewsMock.mockReset();
    getRideReviewsMock.mockResolvedValue({ items: [], nextCursor: null });
    registerForRideMock.mockReset();
    pushMock.mockReset();
    cancelRideRegistrationMock.mockReset();
    changeRegistrationGroupMock.mockReset();
    joinRideWaitlistMock.mockReset();
    getRideRidersMock.mockReset();
    getRideRidersMock.mockResolvedValue({ items: [], nextCursor: null });
    sessionState.status = 'anonymous';
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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

    expect(
      await screen.findByRole('heading', { level: 1, name: baseRide.title }),
    ).toBeInTheDocument();
    expect(screen.getByText('Опубликован')).toBeInTheDocument();
    expect(screen.getByText('Гравийный клуб')).toBeInTheDocument();
    expect(screen.getByText(baseRide.description!)).toBeInTheDocument();
    // startsAt is 05:00 UTC; the ride's own zone is Europe/Moscow (UTC+3).
    expect(screen.getByText(/08:00/)).toBeInTheDocument();
    const hero = screen.getByRole('region', {
      name: 'Маршрут и главные цифры',
    });
    expect(within(hero).getByText('42,3')).toBeInTheDocument();
    expect(within(hero).getByText('350')).toBeInTheDocument();
    expect(within(hero).getByText('24,5')).toBeInTheDocument();
    // `formatDurationParts` joins hours/minutes with NBSP (U+00A0); Testing
    // Library's default normalizer collapses it to a plain space.
    expect(within(hero).getByText('2 ч 30')).toBeInTheDocument();
    const facts = screen.getByTestId('ride-facts');
    expect(within(facts).getByText('500 ₽')).toBeInTheDocument();
    expect(within(facts).getByText('Гравийный')).toBeInTheDocument();
    // CR-155: «12 из 20 участников» as the ticket's big figure, with the
    // ride status in its head.
    const ticket = screen.getByTestId('ride-ticket');
    expect(within(ticket).getByText('12')).toBeInTheDocument();
    expect(within(ticket).getByText('из 20 участников')).toBeInTheDocument();
    expect(within(ticket).getByText('Опубликован')).toBeInTheDocument();
  });

  it('shows «—» for headline metrics that are still null, never 0', async () => {
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
    const hero = screen.getByRole('region', {
      name: 'Маршрут и главные цифры',
    });
    for (const label of ['Дистанция', 'Набор высоты', 'Темп', 'В пути']) {
      expect(within(hero).getByText(label)).toBeInTheDocument();
    }
    expect(within(hero).getAllByText('—')).toHaveLength(4);
    expect(within(hero).queryByText('0')).not.toBeInTheDocument();
    // No limit → no «N из M» ratio, the ticket says so instead.
    expect(
      within(screen.getByTestId('ride-ticket')).getByText(
        'Без ограничения мест',
      ),
    ).toBeInTheDocument();
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

  it('draws only the start pin for a ride with a start point but no route, and offers the map', async () => {
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({
        ride: { ...baseRide, startLat: 55.75, startLng: 37.61 },
      }),
    );

    render(<RideDetailView rideId="ride-1" />);

    expect(
      await screen.findByRole('img', { name: 'Обложка с точками маршрута' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Маршрут пока не загружен')).toBeInTheDocument();
    expect(screen.getAllByTestId('cover-mark')).toHaveLength(1);
    expect(getRouteGeometryMock).not.toHaveBeenCalled();
    expect(screen.getByText('Старт · 08:00')).toBeInTheDocument();
    // No route → no elevation profile.
    expect(screen.queryByText('Профиль высоты')).not.toBeInTheDocument();

    // No MapGL key in the test env — the degraded placeholder, never a blank box.
    fireEvent.click(screen.getByRole('radio', { name: 'Карта' }));
    expect(
      await screen.findByText('Карта маршрута временно недоступна.'),
    ).toBeInTheDocument();
  });

  it('puts stops on the cover and the timeline, even without a route', async () => {
    getRideDetailMock.mockResolvedValue(
      baseDetailResponse({ stops: [baseStop] }),
    );

    render(<RideDetailView rideId="ride-1" />);

    expect(
      await screen.findByText('Кофейня на набережной'),
    ).toBeInTheDocument();
    expect(screen.getAllByTestId('cover-mark')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Карта' })).toBeInTheDocument();
  });

  it('shows difficulty, bike type and price as labelled chips', async () => {
    getRideDetailMock.mockResolvedValue(baseDetailResponse());

    render(<RideDetailView rideId="ride-1" />);

    await screen.findByText(baseRide.title);
    const facts = screen.getByTestId('ride-facts');
    expect(within(facts).getByText(/Тип велосипеда/)).toBeInTheDocument();
    expect(within(facts).getByText(/Стоимость участия/)).toBeInTheDocument();
    expect(within(facts).getByText('Средний')).toBeInTheDocument();
    expect(within(facts).getByText('500 ₽')).toBeInTheDocument();
  });

  it('draws the track, the elevation profile and a hover dot once a route exists', async () => {
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

    const cover = await screen.findByRole('img', {
      name: 'Обложка с треком маршрута',
    });
    // The track sits centred in the window (800px fallback width → x 400),
    // with no elevation silhouette drawn under it — the chart below has that.
    expect(
      cover.querySelector('path.stroke-cover-route')?.getAttribute('d'),
    ).toMatch(/^M400\.0 /);
    expect(cover.querySelector('.fill-cover-elevation')).toBeNull();
    expect(getRouteGeometryMock).toHaveBeenCalledWith('ride-1');
    expect(
      screen.queryByText('Маршрут пока не загружен'),
    ).not.toBeInTheDocument();
    const chart = await screen.findByRole('img', { name: /Профиль высоты/ });
    // CR-128: legible on white paper — the area is filled with the chart's own
    // gradient (not a flat tint) under a 2px `elevation` line.
    const gradient = chart.querySelector('linearGradient');
    expect(gradient).not.toBeNull();
    expect(
      chart.querySelector(`path[fill="url(#${gradient!.id})"]`),
    ).not.toBeNull();
    expect(chart.querySelector('path.stroke-elevation')).not.toBeNull();

    // CR-170: the hero track draws itself in (normalized path length).
    const heroTrack = document.querySelector('[data-track]')!;
    expect(heroTrack.getAttribute('pathLength')).toBe('1');
    expect(heroTrack.getAttribute('stroke-dasharray')).toBe('1');
    expect(heroTrack.getAttribute('class')).toContain(
      'motion-safe:animate-track-draw',
    );

    // CR-151: the pointer over the profile moves a dot along the cover's track.
    expect(screen.queryByTestId('cover-scrub')).not.toBeInTheDocument();
    fireEvent.pointerMove(screen.getByTestId('elevation-hit'), { clientX: 0 });
    expect(await screen.findByTestId('cover-scrub')).toBeInTheDocument();
    expect(screen.getByTestId('elevation-readout').textContent).toMatch(
      /км · 100/,
    );
    fireEvent.pointerLeave(screen.getByTestId('elevation-hit'));
    expect(screen.queryByTestId('cover-scrub')).not.toBeInTheDocument();

    // Degraded map placeholder (no live 2GIS credential) behind «Карта».
    fireEvent.click(screen.getByRole('radio', { name: 'Карта' }));
    expect(
      await screen.findByText('Карта маршрута временно недоступна.'),
    ).toBeInTheDocument();
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

  it('lists stops in their order on «Маршрут по точкам»', async () => {
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

    const timeline = await screen.findByTestId('route-timeline');
    const items = within(timeline).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Кофейня на набережной'),
      expect.stringContaining('Смотровая площадка'),
    ]);
    expect(
      within(items[0]!).getByText(
        /Короткая остановка на кофе\. · стоянка 15 мин/,
      ),
    ).toBeInTheDocument();
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
      expect(screen.queryByText('Записаться')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Отменить регистрацию'),
      ).not.toBeInTheDocument();
    });

    it('offers registration once registration is open', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          registrationsCount: 6,
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      expect(
        await screen.findByRole('button', { name: 'Записаться' }),
      ).toBeInTheDocument();
      // CR-155: «Стартовый лист» — how many are in and how many seats are left.
      const ticket = screen.getByTestId('ride-ticket');
      expect(
        within(ticket).getByRole('heading', { name: 'Стартовый лист' }),
      ).toBeInTheDocument();
      expect(within(ticket).getByText('Осталось 14 мест')).toBeInTheDocument();
      expect(
        within(ticket).getByText('500 ₽ · отменить можно до старта'),
      ).toBeInTheDocument();
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

    // CR-151: the ticket's faces for the states with no register action.
    it('shows «Мест нет» with the queue size on a full ride', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: {
            ...baseRide,
            status: 'registration_open',
            participantLimit: 5,
          },
          registrationsCount: 5,
          waitlistCount: 3,
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const ticket = await screen.findByTestId('ride-ticket');
      expect(
        within(ticket).getByText('Мест нет · 3 в очереди'),
      ).toBeInTheDocument();
      expect(within(ticket).getByText('из 5 участников')).toBeInTheDocument();
      // The status badge reads the waitlist, not a green «open».
      expect(within(ticket).getByText('Список ожидания')).toBeInTheDocument();
    });

    it('shows a closed ride as its final count, with no action', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_closed' },
          registrationsCount: 12,
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const ticket = (
        await screen.findByRole('heading', { name: 'Регистрация закрыта' })
      ).closest('[data-testid="ride-ticket"]') as HTMLElement;
      expect(within(ticket).getByText('12')).toBeInTheDocument();
      expect(within(ticket).getByText('из 20 участников')).toBeInTheDocument();
      expect(
        within(ticket).queryByRole('button', { name: 'Записаться' }),
      ).not.toBeInTheDocument();
    });

    it('voids a registration on a cancelled ride and hides who was riding', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'cancelled' },
          registrationsCount: 4,
          viewerRegistration: activeRegistration(),
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const ticket = (
        await screen.findByRole('heading', { name: 'Заезд отменён' })
      ).closest('[data-testid="ride-ticket"]') as HTMLElement;
      expect(
        within(ticket).getByText('Организатор отменил этот заезд.'),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Отменить регистрацию' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Кто едет' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/через/)).not.toBeInTheDocument();
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
          waitlistCount: 3,
          viewerWaitlistPosition: 2,
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      // CR-119: a heading, not a disabled button posing as one.
      const title = await screen.findByRole('heading', {
        name: 'Вы в списке ожидания',
      });
      const ticket = title.closest(
        '[data-testid="ride-ticket"]',
      ) as HTMLElement;
      // CR-151: the viewer's own place in the queue.
      expect(within(ticket).getByText('2')).toBeInTheDocument();
      expect(
        within(ticket).getByRole('button', {
          name: 'Покинуть список ожидания',
        }),
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

      fireEvent.click(
        await screen.findByRole('button', { name: 'Записаться' }),
      );

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(
        await screen.findByText('Вы зарегистрированы на заезд.'),
      ).toBeInTheDocument();
      expect(registerForRideMock).toHaveBeenCalledWith('ride-1');
    });

    // CR-170: the state change is shown, not swapped — only after mount.
    it('animates the ticket into its new state after registering, not on first render', async () => {
      const registration = activeRegistration();
      registerForRideMock.mockResolvedValue({ registration });
      getRideDetailMock
        .mockResolvedValueOnce(
          baseDetailResponse({
            ride: { ...baseRide, status: 'registration_open' },
          }),
        )
        .mockResolvedValue(
          baseDetailResponse({
            ride: { ...baseRide, status: 'registration_open' },
            registrationsCount: 1,
            viewerRegistration: registration,
            viewerStartNumber: 1,
          }),
        );

      render(
        <ToastProvider>
          <RideDetailView rideId="ride-1" />
        </ToastProvider>,
      );

      const button = await screen.findByRole('button', { name: 'Записаться' });
      const ticket = screen.getByTestId('ride-ticket');
      const body = () =>
        ticket.querySelector('[data-ticket-body]') as HTMLElement;
      expect(body().className).not.toContain('animate-rise-in');
      expect(ticket.className).toContain('transition-colors');

      fireEvent.click(button);

      expect(
        await within(ticket).findByText('Отменить регистрацию'),
      ).toBeInTheDocument();
      expect(ticket.className).toContain('border-success');
      expect(body().className).toContain('motion-safe:animate-rise-in');
    });

    // CR-141 (KI-064): an anonymous «Зарегистрироваться» must not lose the ride.
    it('sends an anonymous viewer to sign in with this ride as the return target', async () => {
      registerForRideMock.mockRejectedValue(groupProblem('unauthorized', 401));
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

      fireEvent.click(
        await screen.findByRole('button', { name: 'Записаться' }),
      );

      await waitFor(() =>
        expect(pushMock).toHaveBeenCalledWith('/login?next=%2Frides%2Fride-1'),
      );
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
    // CR-151: the ticket holds the action; the phone bar only appears once the
    // ticket has scrolled away (hidden and inert until then) and leads back to it.
    it('keeps seats and the fill bar on the ticket and a hidden phone bar that leads back to it', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          registrationsCount: 14,
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const button = await screen.findByRole('button', {
        name: 'Записаться',
      });
      const ticket = screen.getByTestId('ride-ticket');
      expect(ticket).toContainElement(button);
      expect(within(ticket).getByText('Осталось 6 мест')).toBeInTheDocument();
      // ADR-024: a capacity fill bar reinforces the text, doesn't replace it.
      expect(within(ticket).getByRole('progressbar')).toHaveAttribute(
        'aria-valuenow',
        '70',
      );

      const bar = screen.getByTestId('ticket-bar');
      expect(bar).toHaveAttribute('aria-hidden', 'true');
      expect(bar).toHaveAttribute('inert');
      expect(within(bar).getByText('№ 15')).toBeInTheDocument();
      // Only one real register button — the bar's is out of the a11y tree.
      expect(
        screen.getAllByRole('button', { name: 'Записаться' }),
      ).toHaveLength(1);
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
      // CR-155: name · pace in the compact form («25 км/ч», not «25,0»),
      // and how many already ride in the group.
      expect(
        within(picker).getByText('Группа 1 · 25 км/ч'),
      ).toBeInTheDocument();
      expect(within(picker).getByText('7 участников')).toBeInTheDocument();

      const button = screen.getByRole('button', { name: 'Записаться' });
      expect(button).toBeDisabled();
      expect(
        screen.getByText('Выберите группу, чтобы записаться'),
      ).toBeInTheDocument();

      const radio = within(picker).getByRole('radio', { name: /Группа 1/ });
      fireEvent.click(radio);

      expect(radio).toBeChecked();
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
      fireEvent.click(screen.getByRole('button', { name: 'Записаться' }));

      await waitFor(() => {
        expect(registerForRideMock).toHaveBeenCalledWith('ride-1', 'group-2');
      });
      const group = await screen.findByTestId('ticket-group');
      expect(group).toHaveTextContent('Группа 2');
      expect(group).toHaveTextContent('35');
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

      const ticket = await screen.findByTestId('ride-ticket');
      expect(within(ticket).getByText('Мест нет')).toBeInTheDocument();
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
        await screen.findByRole('button', { name: 'Записаться' }),
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
      fireEvent.click(screen.getByRole('button', { name: 'Записаться' }));

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

    it('shows «Вы зарегистрированы» with the start number, when, where and group, and a danger-outline cancel', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'registration_open' },
          groups: [groupOne, groupTwo],
          routePoints: [startPoint],
          registrationsCount: 8,
          viewerRegistration: activeRegistration({ groupId: 'group-1' }),
          viewerStartNumber: 3,
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const ticket = (
        await screen.findByRole('heading', { name: 'Вы зарегистрированы' })
      ).closest('[data-testid="ride-ticket"]') as HTMLElement;
      expect(within(ticket).getByText('3')).toBeInTheDocument();
      expect(within(ticket).getByText('08:00')).toBeInTheDocument();
      expect(within(ticket).getByText('сб 1 мая 2027')).toBeInTheDocument();
      expect(within(ticket).getByText('Кофейня «Зерно»')).toBeInTheDocument();
      expect(within(ticket).getByTestId('ticket-group')).toHaveTextContent(
        'Группа 1',
      );
      const cancel = within(ticket).getByRole('button', {
        name: 'Отменить регистрацию',
      });
      expect(cancel.className).toContain('border-danger');
      expect(cancel.className).not.toContain('bg-danger ');
      // No registration group picker next to the registered ticket.
      expect(
        screen.queryByRole('group', { name: 'Выберите группу' }),
      ).not.toBeInTheDocument();
      // The start point is also the timeline's first item.
      expect(screen.getAllByText('Кофейня «Зерно»').length).toBeGreaterThan(1);
    });

    it('counts down to the start on the ticket (CR-130, CR-151)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      // 2 days, 14 h, 37 min before baseRide's 2027-05-01T05:00Z start.
      vi.setSystemTime(new Date('2027-04-28T14:23:00.000Z'));
      try {
        getRideDetailMock.mockResolvedValue(
          baseDetailResponse({
            ride: { ...baseRide, status: 'registration_open' },
            viewerRegistration: activeRegistration(),
          }),
        );

        render(<RideDetailView rideId="ride-1" />);

        const ticket = (
          await screen.findByRole('heading', { name: 'Вы зарегистрированы' })
        ).closest('[data-testid="ride-ticket"]') as HTMLElement;
        expect(
          within(ticket).getByText('До старта 2 дн 14 ч'),
        ).toBeInTheDocument();
        // The head's relative day, in the ride's own time zone.
        expect(screen.getByText('через 3 дня')).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it('shows no countdown and no cancel once the ride has started (CR-130, CR-151)', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          ride: { ...baseRide, status: 'started' },
          viewerRegistration: activeRegistration(),
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      await screen.findByRole('heading', { name: 'Вы зарегистрированы' });
      expect(screen.queryByText(/До старта/)).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Отменить регистрацию' }),
      ).not.toBeInTheDocument();
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
      expect(screen.getByTestId('ticket-group')).toHaveTextContent('Группа 2');
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
      ).toHaveAttribute('href', '/login?next=%2Frides%2Fride-1');
      const riders = screen.getByRole('region', { name: 'Кто едет' });
      expect(within(riders).getByText('14 из 20')).toBeInTheDocument();
      expect(getRideRidersMock).not.toHaveBeenCalled();
    });

    it('shows signed-in viewers an avatar stack, and the full list grouped by group on demand', async () => {
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
            registrationId: 'reg-anna',
            displayName: 'Анна',
            group: { id: 'group-1', name: 'Группа 1', paceKmh: 25 },
          },
          {
            registrationId: 'reg-noname',
            displayName: null,
            group: { id: 'group-1', name: 'Группа 1', paceKmh: 25 },
          },
          {
            registrationId: 'reg-boris',
            displayName: 'Борис',
            group: { id: 'group-2', name: 'Группа 2', paceKmh: 35 },
          },
          { registrationId: 'reg-vera', displayName: 'Вера', group: null },
        ],
        nextCursor: null,
      });

      render(<RideDetailView rideId="ride-1" />);

      const riders = await screen.findByRole('region', { name: 'Кто едет' });
      // CR-151: avatars link to each rider's card (CR-126), by registrationId.
      const avatars = await within(riders).findByTestId('riders-avatars');
      expect(
        within(avatars).getByRole('link', { name: 'Анна' }),
      ).toHaveAttribute('href', '/rides/ride-1/riders/reg-anna');
      expect(
        within(riders).getByTestId('riders-group-split'),
      ).toHaveTextContent(/Группа 1 · 25 км\/ч — 2/);
      expect(getRideRidersMock).toHaveBeenCalledWith('ride-1');

      const toggle = within(riders).getByRole('button', {
        name: 'Весь список участников',
      });
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      fireEvent.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      // `findByText`, not a role query: the pace joins value and unit with an
      // NBSP, which the text matcher's normalizer collapses and the
      // accessible-name matcher does not.
      const list = within(riders).getByText('Группа 1 · 25 км/ч — 2')
        .parentElement as HTMLElement;
      const headings = within(riders)
        .getAllByRole('heading', { level: 3 })
        .map((heading) => heading.textContent?.replace(/\s+/g, ' '));
      expect(headings).toEqual([
        'Группа 1 · 25 км/ч — 2',
        'Группа 2 · 35 км/ч — 1',
        'Без группы — 1',
      ]);
      expect(within(list).getByText('Анна')).toBeInTheDocument();
      expect(
        within(list).getByText('Участник без имени').closest('a'),
      ).toHaveAttribute('href', '/rides/ride-1/riders/reg-noname');
      expect(within(riders).getByText('Вера')).toBeInTheDocument();
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
          items: [
            { registrationId: 'reg-anna', displayName: 'Анна', group: null },
          ],
          nextCursor: 'cursor-2',
        })
        .mockResolvedValueOnce({
          items: [
            { registrationId: 'reg-boris', displayName: 'Борис', group: null },
          ],
          nextCursor: null,
        });

      render(<RideDetailView rideId="ride-1" />);

      fireEvent.click(
        await screen.findByRole('button', { name: 'Весь список участников' }),
      );
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

  describe('CR-155', () => {
    it('lists the requirements beside «О заезде», and omits the block without them', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          requirements: ['Шлем обязателен', 'С собой: вода, камера'],
        }),
      );

      const { unmount } = render(<RideDetailView rideId="ride-1" />);

      const list = await screen.findByTestId('ride-requirements');
      expect(
        screen.getByRole('heading', { name: 'Требования' }),
      ).toBeInTheDocument();
      expect(
        within(list)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual(['Шлем обязателен', 'С собой: вода, камера']);
      unmount();

      getRideDetailMock.mockResolvedValue(baseDetailResponse());
      render(<RideDetailView rideId="ride-1" />);
      await screen.findByRole('heading', { name: 'О заезде' });
      expect(
        screen.queryByRole('heading', { name: 'Требования' }),
      ).not.toBeInTheDocument();
    });

    it('shows the organizer contact as an actionable link when the API sends one', async () => {
      // CR-165: the API only includes `contact` for a viewer entitled to it, so
      // the component's job is simply to render what it was given — the
      // authorization itself is covered in `ride-contact.routes.test.ts`.
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({
          contact: { type: 'telegram', value: 'coffee_ride' },
        }),
      );

      render(<RideDetailView rideId="ride-1" />);

      const link = await screen.findByTestId('ride-contact-link');
      expect(link).toHaveAttribute('href', 'https://t.me/coffee_ride');
      expect(link).toHaveTextContent('@coffee_ride');
      expect(
        screen.getByRole('heading', { name: 'Связь с организатором' }),
      ).toBeInTheDocument();
    });

    it('omits the contact block entirely when the API sends none', async () => {
      getRideDetailMock.mockResolvedValue(baseDetailResponse());

      render(<RideDetailView rideId="ride-1" />);

      await screen.findByRole('heading', { name: 'О заезде' });
      expect(screen.queryByTestId('ride-contact-link')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Связь с организатором' }),
      ).not.toBeInTheDocument();
    });

    it('downloads an .ics file from «Добавить в календарь» for an upcoming ride', async () => {
      const createObjectURL = vi.fn(() => 'blob:ride');
      const revokeObjectURL = vi.fn();
      const original = {
        createObjectURL: URL.createObjectURL,
        revokeObjectURL: URL.revokeObjectURL,
      };
      URL.createObjectURL = createObjectURL;
      URL.revokeObjectURL = revokeObjectURL;
      const click = vi
        .spyOn(HTMLAnchorElement.prototype, 'click')
        .mockImplementation(() => {});
      getRideDetailMock.mockResolvedValue(baseDetailResponse());

      render(<RideDetailView rideId="ride-1" />);

      fireEvent.click(
        await screen.findByRole('button', { name: 'Добавить в календарь' }),
      );

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
      expect(blob.type).toBe('text/calendar;charset=utf-8');
      expect(await blob.text()).toContain('DTSTART:');
      expect(click).toHaveBeenCalledTimes(1);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:ride');
      click.mockRestore();
      Object.assign(URL, original);
    });

    it('offers no calendar export once the ride is cancelled', async () => {
      getRideDetailMock.mockResolvedValue(
        baseDetailResponse({ ride: { ...baseRide, status: 'cancelled' } }),
      );

      render(<RideDetailView rideId="ride-1" />);

      await screen.findByRole('button', { name: 'Поделиться' });
      expect(
        screen.queryByRole('button', { name: 'Добавить в календарь' }),
      ).not.toBeInTheDocument();
    });
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
