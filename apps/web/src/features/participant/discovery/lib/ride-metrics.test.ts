import { describe, expect, it } from 'vitest';
import type { PublicRideListItem } from 'types';
import {
  buildRideRowMetrics,
  discoveryStatusTerm,
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
    routePreview: null,
    groups: [],
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
