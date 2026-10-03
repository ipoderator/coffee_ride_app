import { describe, expect, it } from 'vitest';
import type { PublicRideListItem } from 'types';
import {
  buildRideCardMetrics,
  buildRideRowMetrics,
  discoveryStatusTerm,
  pickFeaturedRide,
  rideCardSeats,
  ridesSeatsLabel,
  ridesSeatsLeft,
} from './ride-metrics';

function makeRide(
  overrides: Partial<PublicRideListItem> = {},
): PublicRideListItem {
  return {
    id: 'ride-1',
    organizerId: 'org-1',
    title: 'Тестовый заезд',
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
    startDescription: null,
    routePreview: null,
    groups: [],
    waitlistCount: 0,
    ...overrides,
  } as PublicRideListItem;
}

describe('ridesSeatsLeft / ridesSeatsLabel', () => {
  it('returns null when the ride has no capacity limit', () => {
    const ride = makeRide({ participantLimit: null });
    expect(ridesSeatsLeft(ride)).toBeNull();
    expect(ridesSeatsLabel(ride)).toBeNull();
  });

  it('never goes negative when over-registered', () => {
    const ride = makeRide({ participantLimit: 10, registrationsCount: 12 });
    expect(ridesSeatsLeft(ride)).toBe(0);
  });
});

describe('discoveryStatusTerm', () => {
  it('shows the low-seats chip when few seats remain on an open ride', () => {
    const ride = makeRide({
      status: 'registration_open',
      participantLimit: 20,
      registrationsCount: 18,
    });
    expect(discoveryStatusTerm(ride).label).toBe('Мало мест');
    expect(discoveryStatusTerm(ride).tone).toBe('warning');
  });

  it('falls back to the ordinary status label with plenty of seats left', () => {
    const ride = makeRide({
      status: 'registration_open',
      participantLimit: 20,
      registrationsCount: 5,
    });
    expect(discoveryStatusTerm(ride).label).not.toBe('Мало мест');
  });

  it('never overrides a non-open status with the low-seats chip', () => {
    const ride = makeRide({
      status: 'cancelled',
      participantLimit: 20,
      registrationsCount: 19,
    });
    expect(discoveryStatusTerm(ride).label).not.toBe('Мало мест');
    expect(discoveryStatusTerm(ride).tone).toBe('danger');
  });
});

describe('buildRideRowMetrics', () => {
  it('omits a metric whose value is null instead of showing 0', () => {
    const ride = makeRide({ distanceKm: null });
    const keys = buildRideRowMetrics(ride).map((m) => m.key);
    expect(keys).not.toContain('distance');
  });

  it('uses the pace range plus group count when there are 2+ groups', () => {
    const ride = makeRide({
      groups: [
        { name: 'Группа 1', paceKmh: 25 },
        { name: 'Группа 2', paceKmh: 35 },
      ],
    });
    const pace = buildRideRowMetrics(ride).find((m) => m.key === 'pace');
    expect(pace?.suffix).toContain('2');
  });
});

describe('discoveryStatusTerm — full open ride (CR-144)', () => {
  it('offers the waitlist instead of a green «open» when no seats are left', () => {
    const ride = makeRide({ participantLimit: 3, registrationsCount: 3 });
    expect(discoveryStatusTerm(ride)).toEqual({
      label: 'Список ожидания',
      tone: 'info',
    });
  });

  it('keeps the ordinary label for a full ride that is not open', () => {
    const ride = makeRide({
      status: 'registration_closed',
      participantLimit: 3,
      registrationsCount: 3,
    });
    expect(discoveryStatusTerm(ride).label).toBe('Регистрация закрыта');
  });

  it('keeps «open» for an unlimited ride', () => {
    const ride = makeRide({ participantLimit: null, registrationsCount: 50 });
    expect(discoveryStatusTerm(ride).label).toBe('Регистрация открыта');
  });
});

describe('buildRideCardMetrics (CR-144)', () => {
  it('always returns three labelled columns in design order, «—» for a missing one', () => {
    const metrics = buildRideCardMetrics(
      makeRide({ elevationGainMeters: null }),
    );
    expect(
      metrics?.map((m) => [m.key, m.label, m.parts.value, m.missing]),
    ).toEqual([
      ['distance', 'Дистанция', '69,5', false],
      ['elevation', 'Набор высоты', '—', true],
      ['pace', 'Средний темп', '30,0', false],
    ]);
  });

  it('puts the groups count under the pace range', () => {
    const pace = buildRideCardMetrics(
      makeRide({
        paceKmh: null,
        groups: [
          { name: 'Группа 1', paceKmh: 25 },
          { name: 'Группа 2', paceKmh: 35 },
        ],
      }),
    )?.find((m) => m.key === 'pace');
    expect(pace?.parts.value).toBe('25–35');
    expect(pace?.sub).toBe('2 группы');
  });

  it('returns null when all three are missing', () => {
    expect(
      buildRideCardMetrics(
        makeRide({
          distanceKm: null,
          elevationGainMeters: null,
          paceKmh: null,
        }),
      ),
    ).toBeNull();
  });
});

describe('rideCardSeats (CR-144)', () => {
  it('shows taken of limit, seats left and the fill for a limited ride', () => {
    expect(
      rideCardSeats(makeRide({ participantLimit: 20, registrationsCount: 17 })),
    ).toEqual({
      count: '17 из 20 участников',
      note: 'Осталось 3 места',
      level: 'low',
      fillPercent: 85,
    });
  });

  it('marks a full ride and never overfills the bar', () => {
    const seats = rideCardSeats(
      makeRide({ participantLimit: 10, registrationsCount: 12 }),
    );
    expect(seats?.note).toBe('Мест нет');
    expect(seats?.level).toBe('full');
    expect(seats?.fillPercent).toBe(100);
  });

  it('has no bar and says there is no limit for an unlimited ride', () => {
    expect(
      rideCardSeats(
        makeRide({ participantLimit: null, registrationsCount: 0 }),
      ),
    ).toEqual({
      count: 'Пока нет участников',
      note: 'Без ограничения мест',
      level: 'open',
      fillPercent: null,
    });
  });

  // CR-193 (owner QA: a finished card read «Осталось 6 мест»).
  it.each(['started', 'finished', 'cancelled'] as const)(
    'has no seats block at all for a %s ride',
    (status) => {
      expect(
        rideCardSeats(
          makeRide({ status, participantLimit: 10, registrationsCount: 4 }),
        ),
      ).toBeNull();
    },
  );

  it('never offers seats left before registration opens or after it closes', () => {
    expect(
      rideCardSeats(
        makeRide({
          status: 'published',
          participantLimit: 10,
          registrationsCount: 0,
        }),
        { short: true },
      ),
    ).toEqual({
      count: '0 из 10',
      note: 'Запись ещё не открыта',
      level: 'full',
      fillPercent: 0,
    });
    expect(
      rideCardSeats(
        makeRide({
          status: 'registration_closed',
          participantLimit: 10,
          registrationsCount: 10,
          waitlistCount: 2,
        }),
      )?.note,
    ).toBe('Запись закрыта');
    expect(
      rideCardSeats(
        makeRide({ status: 'published', participantLimit: null }),
      )?.note,
    ).toBe('Запись ещё не открыта');
  });
});

describe('pickFeaturedRide (CR-153, CR-185)', () => {
  const routed = {
    routePreview: [
      [55.75, 37.6],
      [55.76, 37.62],
    ] as Array<[number, number]>,
    startLat: 55.75,
    startLng: 37.6,
  };

  it('picks the soonest open ride with a route, a start point and a distance', () => {
    const closed = makeRide({
      id: 'closed',
      status: 'registration_closed',
      ...routed,
    });
    const open = makeRide({ id: 'open', ...routed });
    expect(pickFeaturedRide([closed, open])?.id).toBe('open');
    expect(pickFeaturedRide([])).toBeNull();
  });

  it('never features a ride without a route, start point or distance', () => {
    const noRoute = makeRide({ id: 'no-route', ...routed, routePreview: null });
    const onePoint = makeRide({
      id: 'one-point',
      ...routed,
      routePreview: [[55.75, 37.6]],
    });
    const noStart = makeRide({ id: 'no-start', ...routed, startLat: null });
    const noDistance = makeRide({
      id: 'no-distance',
      ...routed,
      distanceKm: null,
    });
    const good = makeRide({ id: 'good', ...routed });
    expect(
      pickFeaturedRide([noRoute, onePoint, noStart, noDistance, good])?.id,
    ).toBe('good');
    // No qualifying ride: no featured card (no fallback to the soonest).
    expect(pickFeaturedRide([noRoute, noStart])).toBeNull();
    expect(
      pickFeaturedRide([
        makeRide({ id: 'closed', status: 'registration_closed', ...routed }),
      ]),
    ).toBeNull();
  });
});
