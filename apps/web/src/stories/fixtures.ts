import type { ListPublicRidesResponse, PublicRideListItem } from 'types';

// CR-158: story fixtures only — the same shape `GET /v1/rides` returns
// (`RideGridCard.test.tsx`'s `makeRide`, with a fixed date so stories and
// their screenshots never drift with the calendar).
export function makeRide(
  overrides: Partial<PublicRideListItem> = {},
): PublicRideListItem {
  return {
    id: 'ride-1',
    organizerId: 'org-1',
    title: 'Гравийная сотка по Подмосковью',
    description: null,
    coverImageUrl: null,
    bicycleType: 'gravel',
    startsAt: '2026-10-04T06:00:00.000Z',
    startTimezone: 'Europe/Moscow',
    startLat: null,
    startLng: null,
    participantLimit: 20,
    priceRub: null,
    distanceKm: 69.5,
    elevationGainMeters: 350,
    paceKmh: null,
    durationMinutes: 210,
    difficulty: 3,
    participantsVisible: true,
    status: 'registration_open',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    updatedBy: null,
    organizer: {
      id: 'org-1',
      name: 'Велоклуб «Утро»',
      avatarUrl: null,
      rating: null,
      reviewCount: 0,
    },
    registrationsCount: 8,
    startLabel: null,
    routePreview: [
      [55.75, 37.6],
      [55.76, 37.62],
      [55.77, 37.61],
      [55.78, 37.64],
      [55.765, 37.66],
    ],
    groups: [
      { name: 'Группа 1', paceKmh: 25 },
      { name: 'Группа 2', paceKmh: 30 },
    ],
    waitlistCount: 0,
    ...overrides,
  } as PublicRideListItem;
}

export const SAMPLE_RIDES: PublicRideListItem[] = [
  makeRide(),
  makeRide({
    id: 'ride-2',
    title: 'Шоссейный круг до Звенигорода',
    bicycleType: 'road',
    startsAt: '2026-10-05T05:30:00.000Z',
    distanceKm: 112,
    elevationGainMeters: 900,
    difficulty: 4,
    registrationsCount: 18,
    priceRub: 500,
    groups: [],
    paceKmh: 30,
  }),
  makeRide({
    id: 'ride-3',
    title: 'Лёгкий кофейный заезд по набережным',
    bicycleType: 'any',
    startsAt: '2026-10-06T07:00:00.000Z',
    distanceKm: 32,
    elevationGainMeters: 120,
    difficulty: 1,
    participantLimit: null,
    registrationsCount: 5,
    groups: [],
    paceKmh: 18,
  }),
];

export function listResponse(
  items: PublicRideListItem[],
): ListPublicRidesResponse {
  return { items, nextCursor: null, total: items.length };
}
