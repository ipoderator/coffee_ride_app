import { describe, expect, it } from 'vitest';
import type { Ride } from 'types';
import { pickNearestRide } from './own-rides';

const NOW = new Date('2026-09-26T12:00:00Z');

function ride(id: string, overrides: Partial<Ride> = {}): Ride {
  return {
    id,
    organizerId: 'org-1',
    title: id,
    description: null,
    coverImageUrl: null,
    bicycleType: 'road',
    startsAt: '2026-10-04T06:00:00.000Z',
    startTimezone: 'Europe/Moscow',
    startLat: null,
    startLng: null,
    participantLimit: 20,
    priceRub: null,
    distanceKm: null,
    elevationGainMeters: null,
    paceKmh: null,
    durationMinutes: null,
    difficulty: null,
    participantsVisible: true,
    status: 'registration_open',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    updatedBy: null,
    ...overrides,
  };
}

describe('pickNearestRide (CR-131)', () => {
  it('picks the soonest upcoming published ride', () => {
    const rides = [
      ride('later', { startsAt: '2026-10-10T06:00:00Z' }),
      ride('draft', { status: 'draft', startsAt: '2026-09-27T06:00:00Z' }),
      ride('cancelled', {
        status: 'cancelled',
        startsAt: '2026-09-27T06:00:00Z',
      }),
      ride('past', {
        status: 'registration_closed',
        startsAt: '2026-09-20T06:00:00Z',
      }),
      ride('soon', { status: 'published', startsAt: '2026-09-28T06:00:00Z' }),
    ];
    expect(pickNearestRide(rides, NOW)?.id).toBe('soon');
  });

  it('prefers a ride under way', () => {
    const rides = [
      ride('soon', { startsAt: '2026-09-27T06:00:00Z' }),
      ride('now', { status: 'started', startsAt: '2026-09-26T09:00:00Z' }),
    ];
    expect(pickNearestRide(rides, NOW)?.id).toBe('now');
  });

  it('is null without an upcoming ride', () => {
    expect(
      pickNearestRide([ride('done', { status: 'finished' })], NOW),
    ).toBeNull();
  });
});
