import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Ride } from 'types';
import { ApiError } from '@/lib/api/errors';
import { loadOrganizerNavBadges } from './nav-badges';
import {
  fetchNearestOwnRide,
  listAllRideParticipants,
  listOwnRidesPage,
  pickNearestRide,
} from './own-rides';

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

const MINE_URL = '/api/v1/rides/mine?limit=100';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('in-flight GET de-duplication (CR-133, KI-066)', () => {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares one request between concurrent identical reads', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ items: [ride('r1')], nextCursor: null }),
    );

    const [a, b] = await Promise.all([listOwnRidesPage(), listOwnRidesPage()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(MINE_URL);
    expect(a.map((r) => r.id)).toEqual(['r1']);
    expect(b.map((r) => r.id)).toEqual(['r1']);
  });

  it('fetches again once the earlier request has settled — no caching', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ items: [], nextCursor: null }),
    );

    await listOwnRidesPage();
    await listOwnRidesPage();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('rejects every concurrent caller on failure and does not reuse it', async () => {
    fetchMock.mockImplementationOnce(async () =>
      jsonResponse({ status: 500, title: 'Internal', code: 'internal' }, 500),
    );
    fetchMock.mockImplementation(async () =>
      jsonResponse({ items: [ride('r1')], nextCursor: null }),
    );

    const results = await Promise.allSettled([
      listOwnRidesPage(),
      listOwnRidesPage(),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result.status).toBe('rejected');
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(ApiError);
      }
    }

    await expect(listOwnRidesPage()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shares each participants page between concurrent reads of one ride', async () => {
    fetchMock.mockImplementation(async (url) =>
      url.includes('cursor=')
        ? jsonResponse({ items: [{ id: 'p2' }], nextCursor: null })
        : jsonResponse({ items: [{ id: 'p1' }], nextCursor: 'next' }),
    );

    const [a, b] = await Promise.all([
      listAllRideParticipants('ride-1'),
      listAllRideParticipants('ride-1'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/rides/ride-1/participants?limit=100',
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/rides/ride-1/participants?limit=100&cursor=next',
    );
    expect(a.map((p) => p.id)).toEqual(['p1', 'p2']);
    expect(b.map((p) => p.id)).toEqual(['p1', 'p2']);
    // Each caller gets its own accumulated array.
    expect(a).not.toBe(b);
  });

  it('keeps different rides as separate requests', async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse({ items: [], nextCursor: null }),
    );

    await Promise.all([
      listAllRideParticipants('ride-1'),
      listAllRideParticipants('ride-2'),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('the sidebar badge and the dashboard read /rides/mine once together', async () => {
    const soon = ride('soon', { startsAt: '2026-09-28T06:00:00Z' });
    fetchMock.mockImplementation(async (url) =>
      url === MINE_URL
        ? jsonResponse({ items: [soon], nextCursor: null })
        : jsonResponse({ items: [], nextCursor: null }),
    );

    const [badges, nearest, rides] = await Promise.all([
      loadOrganizerNavBadges(NOW),
      fetchNearestOwnRide(NOW),
      listOwnRidesPage(),
    ]);

    expect(badges).toEqual({ newRegistrations: 0 });
    expect(nearest?.id).toBe('soon');
    expect(rides).toHaveLength(1);
    expect(
      fetchMock.mock.calls.filter(([url]) => url === MINE_URL),
    ).toHaveLength(1);
  });
});
