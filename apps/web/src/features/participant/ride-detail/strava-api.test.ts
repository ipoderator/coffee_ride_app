import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getStravaStatus, startStravaSync } from './api';

// CR-234: the two Strava calls of the ride page's API client.
function respond(status: number, body: unknown) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getStravaStatus', () => {
  it('passes the server answer through', async () => {
    const fetchMock = respond(200, { available: true });
    vi.stubGlobal('fetch', fetchMock);
    await expect(getStravaStatus()).resolves.toEqual({ available: true });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/strava/status');
  });

  it('fails soft to unavailable on an error status or a network failure', async () => {
    vi.stubGlobal('fetch', respond(500, {}));
    await expect(getStravaStatus()).resolves.toEqual({ available: false });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('offline');
      }),
    );
    await expect(getStravaStatus()).resolves.toEqual({ available: false });
  });
});

describe('startStravaSync', () => {
  it('posts for the ride and returns the consent URL', async () => {
    const fetchMock = respond(200, {
      authorizeUrl: 'https://www.strava.com/oauth/authorize?state=s',
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(startStravaSync('ride-1')).resolves.toEqual({
      authorizeUrl: 'https://www.strava.com/oauth/authorize?state=s',
    });
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/rides/ride-1/strava-sync', {
      method: 'POST',
    });
  });

  it('throws the problem as an ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      respond(409, {
        type: 'about:blank',
        title: 'Ride has not started',
        status: 409,
        detail: 'x',
        instance: '/v1/rides/ride-1/strava-sync',
        code: 'ride_not_in_progress',
      }),
    );
    const error = await startStravaSync('ride-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.code).toBe('ride_not_in_progress');
  });
});
