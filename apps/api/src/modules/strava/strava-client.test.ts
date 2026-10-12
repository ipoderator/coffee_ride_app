import { describe, expect, it, vi } from 'vitest';
import {
  createStravaClient,
  StravaRejectedError,
  StravaUnavailableError,
} from './strava-client.js';

// CR-234: the HTTP edge of the Strava integration — request shape, 4xx vs 5xx
// handling, retries only where idempotent, and defensive parsing.

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function client(fetchImpl: typeof fetch) {
  return createStravaClient({
    clientId: '286429',
    clientSecret: 's3cret',
    fetchImpl,
  });
}

const WINDOW = {
  after: new Date('2026-10-04T05:30:00.000Z'),
  before: new Date('2026-10-04T09:00:00.000Z'),
};

describe('Strava client', () => {
  it('builds the authorize URL with activity:read only', () => {
    const url = new URL(
      client(vi.fn()).authorizeUrl({
        redirectUri: 'https://coffeeride.site/api/v1/strava/callback',
        state: 'st',
      }),
    );
    expect(url.origin).toBe('https://www.strava.com');
    expect(url.pathname).toBe('/oauth/authorize');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: '286429',
      response_type: 'code',
      redirect_uri: 'https://coffeeride.site/api/v1/strava/callback',
      approval_prompt: 'auto',
      scope: 'activity:read',
      state: 'st',
    });
  });

  it('exchanges a code with the client credentials, without retrying', async () => {
    const fetchImpl = vi.fn(async () => json(200, { access_token: 'tok' }));
    expect(await client(fetchImpl).exchangeCode('c0de')).toBe('tok');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://www.strava.com/oauth/token');
    expect(Object.fromEntries(new URLSearchParams(String(init.body)))).toEqual({
      client_id: '286429',
      client_secret: 's3cret',
      code: 'c0de',
      grant_type: 'authorization_code',
    });

    const failing = vi.fn(async () => json(502, {}));
    await expect(client(failing).exchangeCode('c0de')).rejects.toBeInstanceOf(
      StravaUnavailableError,
    );
    expect(failing).toHaveBeenCalledTimes(1);
  });

  it('a 4xx is a rejection, not an outage', async () => {
    const fetchImpl = vi.fn(async () => json(400, { message: 'Bad Request' }));
    await expect(client(fetchImpl).exchangeCode('used')).rejects.toBeInstanceOf(
      StravaRejectedError,
    );
    await expect(
      client(fetchImpl).listActivities('tok', WINDOW),
    ).rejects.toBeInstanceOf(StravaRejectedError);
  });

  it('lists activities in the window, retrying once on 429/5xx', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}))
      .mockResolvedValueOnce(
        json(200, [
          {
            id: 20489295499,
            sport_type: 'Ride',
            start_date: '2026-10-04T07:05:00Z',
            distance: 16038.2,
            map: { summary_polyline: '_p~iF~ps|U' },
          },
          { id: 2, type: 'VirtualRide', start_date: '2026-10-04T07:00:00Z' },
          { id: 'x', sport_type: 'Ride', start_date: 'not a date' },
          'junk',
        ]),
      );
    const activities = await client(fetchImpl).listActivities('tok', WINDOW);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[1] as [string, RequestInit];
    expect(url).toBe(
      `https://www.strava.com/api/v3/athlete/activities?after=${WINDOW.after.getTime() / 1000}&before=${WINDOW.before.getTime() / 1000}&per_page=30`,
    );
    expect(init.headers).toEqual({ authorization: 'Bearer tok' });
    expect(activities).toEqual([
      {
        id: '20489295499',
        sportType: 'Ride',
        startDate: new Date('2026-10-04T07:05:00Z'),
        distanceMeters: 16038.2,
        summaryPolyline: '_p~iF~ps|U',
      },
      {
        id: '2',
        sportType: 'VirtualRide',
        startDate: new Date('2026-10-04T07:00:00Z'),
        distanceMeters: 0,
        summaryPolyline: null,
      },
    ]);
  });

  it('turns odd bodies into unavailability', async () => {
    const notJson = vi.fn(async () => new Response('<html>', { status: 200 }));
    await expect(
      client(notJson).listActivities('tok', WINDOW),
    ).rejects.toBeInstanceOf(StravaUnavailableError);

    const notList = vi.fn(async () => json(200, { activities: [] }));
    await expect(
      client(notList).listActivities('tok', WINDOW),
    ).rejects.toBeInstanceOf(StravaUnavailableError);

    const noToken = vi.fn(async () => json(200, { athlete: {} }));
    await expect(client(noToken).exchangeCode('c')).rejects.toBeInstanceOf(
      StravaUnavailableError,
    );
  });

  it('opens the breaker after repeated outages', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const strava = client(down);
    for (let i = 0; i < 5; i++) {
      await expect(strava.exchangeCode('c')).rejects.toBeInstanceOf(
        StravaUnavailableError,
      );
    }
    const calls = down.mock.calls.length;
    await expect(strava.exchangeCode('c')).rejects.toThrow(/circuit open/);
    expect(down).toHaveBeenCalledTimes(calls);
  });

  it('reads an activity track from its latlng stream, thinned', async () => {
    const data = Array.from({ length: 5000 }, (_, i) => [
      52.5 + i * 1e-5,
      39.5,
    ]);
    const fetchImpl = vi.fn(async () =>
      json(200, { latlng: { data }, distance: { data: [] } }),
    );
    const track = await client(fetchImpl).getActivityTrack('tok', '123');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      'https://www.strava.com/api/v3/activities/123/streams?keys=latlng&key_by_type=true',
    );
    expect(init.headers).toEqual({ authorization: 'Bearer tok' });
    expect(track).toHaveLength(1667);
    expect(track![0]).toEqual({ lat: 52.5, lng: 39.5 });
  });

  it('has no track for a missing stream or an odd body', async () => {
    for (const response of [
      json(404, { message: 'Record Not Found' }),
      json(200, { distance: { data: [] } }),
      json(200, { latlng: { data: [[52.5, 39.5], 'x'] } }),
    ]) {
      const fetchImpl = vi.fn(async () => response);
      await expect(
        client(fetchImpl).getActivityTrack('tok', '1'),
      ).resolves.toBeNull();
    }
  });

  it('deauthorizes with the bearer token', async () => {
    const fetchImpl = vi.fn(async () => json(200, { access_token: 'tok' }));
    await client(fetchImpl).deauthorize('tok');
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://www.strava.com/oauth/deauthorize');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ authorization: 'Bearer tok' });
  });
});
