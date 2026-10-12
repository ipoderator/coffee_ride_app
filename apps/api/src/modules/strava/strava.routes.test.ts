import { sql } from 'drizzle-orm';
import { routes } from 'db/schema';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';
import { signUp, WEB_ORIGIN } from '../../test-support/app-fixtures.js';
import { encodePolyline, line } from '../../test-support/polyline.js';
import { buildRoutePreview } from '../rides/route-preview.js';
import { simplifyRouteGeometry } from '../rides/route-geometry.js';
import {
  StravaRejectedError,
  StravaUnavailableError,
  type StravaActivitySummary,
  type StravaClient,
} from './strava-client.js';
import { createOAuthState } from './oauth-state.js';

// CR-234 (ADR-033): «Синхронизировать со Strava» end to end — real Postgres, a fake
// Strava client (the HTTP client itself is covered by `strava-client.test.ts`).
const AUTH_SECRET = 'a-test-only-secret';
const env = (strava: boolean) =>
  loadEnv({
    NODE_ENV: 'test',
    AUTH_SECRET,
    DATABASE_URL: getTestDatabaseUrl(),
    WEB_ORIGIN,
    ...(strava
      ? { STRAVA_CLIENT_ID: '286429', STRAVA_CLIENT_SECRET: 'test-secret' }
      : {}),
  });

type App = Awaited<ReturnType<typeof buildApp>>;

const STARTS_AT = '2027-05-01T05:00:00.000Z';
const A = { lat: 52.6, lng: 39.6 };
const B = { lat: 52.6, lng: 39.76 };
const ROUTE = line(A, B, 200);

function bikeRide(
  overrides: Partial<StravaActivitySummary> = {},
): StravaActivitySummary {
  return {
    id: '20489295499',
    sportType: 'Ride',
    startDate: new Date(Date.parse(STARTS_AT) + 10 * 60_000),
    distanceMeters: 11_000,
    summaryPolyline: encodePolyline(ROUTE),
    ...overrides,
  };
}

function fakeStrava(activities: StravaActivitySummary[] = [bikeRide()]) {
  const client = {
    authorizeUrl: vi.fn(
      ({ redirectUri, state }: { redirectUri: string; state: string }) =>
        `https://www.strava.com/oauth/authorize?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`,
    ),
    exchangeCode: vi.fn(async (code: string) => `token-for-${code}`),
    listActivities: vi.fn(async () => activities),
    getActivityTrack: vi.fn(
      async (): Promise<Array<{ lat: number; lng: number }> | null> => null,
    ),
    deauthorize: vi.fn(async () => undefined),
  } satisfies StravaClient;
  return client;
}

async function withApp(
  strava: ReturnType<typeof fakeStrava> | null,
  run: (app: App) => Promise<void>,
) {
  const app = await buildApp(env(strava !== null));
  app.stravaClient = strava;
  try {
    await run(app);
  } finally {
    await app.close();
  }
}

function call(
  app: App,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  session?: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: { origin: WEB_ORIGIN },
    ...(session ? { cookies: { session } } : {}),
    ...(payload ? { payload } : {}),
  });
}

/** A started ride with a 11 km route and one registered participant. */
async function startedRide(
  app: App,
  options: { route?: boolean; start?: boolean } = {},
) {
  const organizer = await signUp(app);
  await call(app, 'POST', '/v1/organizers/me', organizer, { name: 'Клуб' });
  const created = await call(app, 'POST', '/v1/rides', organizer, {
    title: 'Утренний круг',
    bicycleType: 'road',
    startsAt: STARTS_AT,
    startTimezone: 'Europe/Moscow',
  });
  expect(created.statusCode).toBe(201);
  const rideId = created.json().ride.id as string;
  const patched = await call(app, 'PATCH', `/v1/rides/${rideId}`, organizer, {
    distanceKm: 11,
    ...(options.start === false ? {} : { startLat: A.lat, startLng: A.lng }),
  });
  expect(patched.statusCode).toBe(200);
  if (options.route !== false) {
    const geometry = ROUTE.map((p) => ({ ...p, elevationMeters: null }));
    await app.db.insert(routes).values({
      rideId,
      gpxFileKey: `routes/${rideId}.gpx`,
      gpxFileName: 'route.gpx',
      gpxFileSizeBytes: 1000,
      distanceKm: 11,
      elevationGainMeters: 0,
      pointCount: geometry.length,
      geometry: simplifyRouteGeometry(geometry),
      preview: buildRoutePreview(geometry),
    });
  }
  for (const step of ['publish', 'open-registration']) {
    expect(
      (await call(app, 'POST', `/v1/rides/${rideId}/${step}`, organizer))
        .statusCode,
    ).toBe(200);
  }
  const participant = await signUp(app);
  expect(
    (await call(app, 'POST', `/v1/rides/${rideId}/register`, participant))
      .statusCode,
  ).toBe(201);
  const advance = async (steps: string[]) => {
    for (const step of steps) {
      expect(
        (await call(app, 'POST', `/v1/rides/${rideId}/${step}`, organizer))
          .statusCode,
      ).toBe(200);
    }
  };
  return { organizer, participant, rideId, advance };
}

const START = ['close-registration', 'start'];

/** Presses the button and follows Strava back with `query`. */
async function sync(
  app: App,
  rideId: string,
  session: string,
  query: Record<string, string> = {
    code: 'abc',
    scope: 'read,activity:read',
  },
) {
  const started = await call(
    app,
    'POST',
    `/v1/rides/${rideId}/strava-sync`,
    session,
  );
  expect(started.statusCode).toBe(200);
  const state = new URL(started.json().authorizeUrl).searchParams.get('state')!;
  const callback = await app.inject({
    method: 'GET',
    url: `/v1/strava/callback?${new URLSearchParams({ state, ...query })}`,
    cookies: { session },
  });
  expect(callback.statusCode).toBe(303);
  return new URL(callback.headers.location as string);
}

async function ownRegistration(app: App, rideId: string, session: string) {
  const res = await call(app, 'GET', `/v1/rides/${rideId}`, session);
  return res.json().viewerRegistration as {
    finishClaimedAt: string | null;
    stravaVerifiedAt: string | null;
    stravaActivityId: string | null;
  };
}

async function participantRow(app: App, rideId: string, organizer: string) {
  const res = await call(
    app,
    'GET',
    `/v1/rides/${rideId}/participants`,
    organizer,
  );
  return res.json().items[0] as Record<string, unknown>;
}

async function wipe() {
  const app = await buildApp(env(false));
  await app.db.execute(sql`DELETE FROM rides`);
  await app.db.execute(sql`DELETE FROM users`);
  await app.close();
}

describe('Strava finish verification (CR-234)', () => {
  beforeEach(wipe);
  afterAll(wipe);

  it('GET /v1/strava/status reflects whether a client is configured', async () => {
    await withApp(null, async (app) => {
      const res = await call(app, 'GET', '/v1/strava/status');
      expect(res.json()).toEqual({ available: false });
    });
    await withApp(fakeStrava(), async (app) => {
      const res = await call(app, 'GET', '/v1/strava/status');
      expect(res.json()).toEqual({ available: true });
    });
  });

  describe('POST /v1/rides/:id/strava-sync', () => {
    it('503 strava_unavailable without a configured client', async () => {
      await withApp(null, async (app) => {
        const { participant, rideId, advance } = await startedRide(app);
        await advance(START);
        const res = await call(
          app,
          'POST',
          `/v1/rides/${rideId}/strava-sync`,
          participant,
        );
        expect(res.statusCode).toBe(503);
        expect(res.json().code).toBe('strava_unavailable');
      });
    });

    it('requires a session, an own registration and a started ride', async () => {
      const strava = fakeStrava();
      await withApp(strava, async (app) => {
        const { organizer, participant, rideId, advance } =
          await startedRide(app);
        const url = `/v1/rides/${rideId}/strava-sync`;

        expect((await call(app, 'POST', url)).statusCode).toBe(401);
        const early = await call(app, 'POST', url, participant);
        expect(early.statusCode).toBe(409);
        expect(early.json().code).toBe('ride_not_in_progress');

        await advance(START);
        const stranger = await call(app, 'POST', url, organizer);
        expect(stranger.statusCode).toBe(404);
        expect(stranger.json().code).toBe('registration_not_found');

        const ok = await call(app, 'POST', url, participant);
        expect(ok.statusCode).toBe(200);
        expect(strava.authorizeUrl).toHaveBeenCalledWith(
          expect.objectContaining({
            redirectUri: 'http://localhost:3000/api/v1/strava/callback',
          }),
        );
      });
    });

    it('409 attendance_already_decided once the organizer decided', async () => {
      await withApp(fakeStrava(), async (app) => {
        const { organizer, participant, rideId, advance } =
          await startedRide(app);
        await advance(START);
        const row = await participantRow(app, rideId, organizer);
        await call(app, 'PUT', `/v1/rides/${rideId}/attendance`, organizer, {
          registrationIds: [row.id],
          attendance: 'no_show',
        });
        const res = await call(
          app,
          'POST',
          `/v1/rides/${rideId}/strava-sync`,
          participant,
        );
        expect(res.statusCode).toBe(409);
        expect(res.json().code).toBe('attendance_already_decided');
      });
    });
  });

  describe('GET /v1/strava/callback', () => {
    it('verifies a matching ride: claim + mark, organizer sees only the flag', async () => {
      const strava = fakeStrava();
      await withApp(strava, async (app) => {
        const { organizer, participant, rideId, advance } =
          await startedRide(app);
        await advance(START);

        const landed = await sync(app, rideId, participant);
        expect(landed.pathname).toBe(`/rides/${rideId}`);
        expect(landed.searchParams.get('strava')).toBe('verified');
        expect(strava.exchangeCode).toHaveBeenCalledWith('abc');
        // One-shot: the grant is revoked with the token it was used with.
        expect(strava.deauthorize).toHaveBeenCalledWith('token-for-abc');

        const own = await ownRegistration(app, rideId, participant);
        expect(own.finishClaimedAt).not.toBeNull();
        expect(own.stravaVerifiedAt).not.toBeNull();
        expect(own.stravaActivityId).toBe('20489295499');

        const row = await participantRow(app, rideId, organizer);
        expect(row.stravaVerified).toBe(true);
        expect(row.finishClaimedAt).not.toBeNull();
        expect(row.attendance).toBeNull();
        expect(row).not.toHaveProperty('stravaActivityId');

        // The existing «confirm everyone who claimed» picks the verified claim up.
        const confirmed = await call(
          app,
          'POST',
          `/v1/rides/${rideId}/attendance/confirm-claimed`,
          organizer,
        );
        expect(confirmed.json().updated).toBe(1);
      });
    });

    it('keeps an earlier claim timestamp and clears the mark with the claim', async () => {
      await withApp(fakeStrava(), async (app) => {
        const { participant, rideId, advance } = await startedRide(app);
        await advance(START);
        await call(
          app,
          'POST',
          `/v1/rides/${rideId}/finish-claim`,
          participant,
        );
        const claimedAt = (await ownRegistration(app, rideId, participant))
          .finishClaimedAt;

        await sync(app, rideId, participant);
        const own = await ownRegistration(app, rideId, participant);
        expect(own.finishClaimedAt).toBe(claimedAt);
        expect(own.stravaVerifiedAt).not.toBeNull();

        await call(
          app,
          'DELETE',
          `/v1/rides/${rideId}/finish-claim`,
          participant,
        );
        const withdrawn = await ownRegistration(app, rideId, participant);
        expect(withdrawn.finishClaimedAt).toBeNull();
        expect(withdrawn.stravaVerifiedAt).toBeNull();
        expect(withdrawn.stravaActivityId).toBeNull();
      });
    });

    it('reads the track stream when Strava lists the ride without a polyline', async () => {
      const strava = fakeStrava([bikeRide({ summaryPolyline: null })]);
      strava.getActivityTrack.mockResolvedValue(ROUTE);
      await withApp(strava, async (app) => {
        const { participant, rideId, advance } = await startedRide(app);
        await advance(START);
        const landed = await sync(app, rideId, participant);
        expect(landed.searchParams.get('strava')).toBe('verified');
        expect(strava.getActivityTrack).toHaveBeenCalledWith(
          'token-for-abc',
          '20489295499',
        );
      });
    });

    it('verifies a ride without a route by its meeting point and distance', async () => {
      await withApp(fakeStrava(), async (app) => {
        const { participant, rideId, advance } = await startedRide(app, {
          route: false,
        });
        await advance(START);
        const landed = await sync(app, rideId, participant);
        expect(landed.searchParams.get('strava')).toBe('verified');
      });
    });

    it.each([
      ['no_activity', [bikeRide({ sportType: 'VirtualRide' })]],
      [
        'no_match',
        [
          bikeRide({
            summaryPolyline: encodePolyline(
              line({ lat: 55.75, lng: 37.6 }, { lat: 55.75, lng: 37.8 }),
            ),
          }),
        ],
      ],
    ] as const)(
      'reports %s and writes nothing',
      async (outcome, activities) => {
        const strava = fakeStrava([...activities]);
        await withApp(strava, async (app) => {
          const { participant, rideId, advance } = await startedRide(app);
          await advance(START);
          const landed = await sync(app, rideId, participant);
          expect(landed.searchParams.get('strava')).toBe(outcome);
          expect(strava.deauthorize).toHaveBeenCalled();
          const own = await ownRegistration(app, rideId, participant);
          expect(own.finishClaimedAt).toBeNull();
          expect(own.stravaVerifiedAt).toBeNull();
        });
      },
    );

    it('denied: the athlete cancelled or unticked activity access', async () => {
      const strava = fakeStrava();
      await withApp(strava, async (app) => {
        const { participant, rideId, advance } = await startedRide(app);
        await advance(START);

        const cancelled = await sync(app, rideId, participant, {
          error: 'access_denied',
        });
        expect(cancelled.searchParams.get('strava')).toBe('denied');
        expect(strava.exchangeCode).not.toHaveBeenCalled();

        const unticked = await sync(app, rideId, participant, {
          code: 'abc',
          scope: 'read',
        });
        expect(unticked.searchParams.get('strava')).toBe('denied');
        expect(strava.listActivities).not.toHaveBeenCalled();
        expect(strava.deauthorize).toHaveBeenCalledTimes(1);
      });
    });

    it('unavailable when Strava is down; error when it rejects the code', async () => {
      const strava = fakeStrava();
      await withApp(strava, async (app) => {
        const { participant, rideId, advance } = await startedRide(app);
        await advance(START);

        strava.listActivities.mockRejectedValueOnce(
          new StravaUnavailableError('down'),
        );
        const down = await sync(app, rideId, participant);
        expect(down.searchParams.get('strava')).toBe('unavailable');
        expect(strava.deauthorize).toHaveBeenCalledTimes(1);

        strava.exchangeCode.mockRejectedValueOnce(
          new StravaRejectedError('bad code'),
        );
        const rejected = await sync(app, rideId, participant);
        expect(rejected.searchParams.get('strava')).toBe('error');

        strava.exchangeCode.mockRejectedValueOnce(
          new StravaUnavailableError('down'),
        );
        const exchangeDown = await sync(app, rideId, participant);
        expect(exchangeDown.searchParams.get('strava')).toBe('unavailable');

        // A failed revoke is logged, not shown: the match itself succeeded.
        strava.deauthorize.mockRejectedValueOnce(new Error('revoke failed'));
        const verified = await sync(app, rideId, participant);
        expect(verified.searchParams.get('strava')).toBe('verified');
      });
    });

    it('refuses a forged, foreign or missing state without touching Strava', async () => {
      const strava = fakeStrava();
      await withApp(strava, async (app) => {
        const { organizer, participant, rideId, advance } =
          await startedRide(app);
        await advance(START);
        const started = await call(
          app,
          'POST',
          `/v1/rides/${rideId}/strava-sync`,
          participant,
        );
        const state = new URL(started.json().authorizeUrl).searchParams.get(
          'state',
        )!;
        const forged = createOAuthState('another-secret', {
          userId: 'x',
          rideId,
        });

        for (const [query, session] of [
          [`state=${state}&code=abc`, organizer], // someone else's browser
          [`state=${state}&code=abc`, undefined], // signed out
          [`state=${forged}&code=abc`, participant],
          ['code=abc', participant],
        ] as const) {
          const res = await app.inject({
            method: 'GET',
            url: `/v1/strava/callback?${query}`,
            ...(session ? { cookies: { session } } : {}),
          });
          expect(res.statusCode).toBe(303);
          const landed = new URL(res.headers.location as string);
          expect(landed.pathname).toBe('/me/rides');
          expect(landed.searchParams.get('strava')).toBe('error');
        }
        expect(strava.exchangeCode).not.toHaveBeenCalled();
      });
    });

    it('already_decided when the organizer decided during the consent screen', async () => {
      const strava = fakeStrava();
      await withApp(strava, async (app) => {
        const { organizer, participant, rideId, advance } =
          await startedRide(app);
        await advance(START);
        const started = await call(
          app,
          'POST',
          `/v1/rides/${rideId}/strava-sync`,
          participant,
        );
        const state = new URL(started.json().authorizeUrl).searchParams.get(
          'state',
        )!;
        const row = await participantRow(app, rideId, organizer);
        await call(app, 'PUT', `/v1/rides/${rideId}/attendance`, organizer, {
          registrationIds: [row.id],
          attendance: 'finished',
        });
        const res = await app.inject({
          method: 'GET',
          url: `/v1/strava/callback?state=${state}&code=abc&scope=activity:read`,
          cookies: { session: participant },
        });
        expect(
          new URL(res.headers.location as string).searchParams.get('strava'),
        ).toBe('already_decided');
        // The grant is still revoked, so it doesn't hold an athlete slot.
        expect(strava.deauthorize).toHaveBeenCalledWith('token-for-abc');
        expect(strava.listActivities).not.toHaveBeenCalled();
      });
    });

    it('redirects with unavailable when the server has no Strava client', async () => {
      await withApp(null, async (app) => {
        const res = await app.inject({
          method: 'GET',
          url: '/v1/strava/callback?code=abc&state=x',
        });
        expect(res.statusCode).toBe(303);
        expect(
          new URL(res.headers.location as string).searchParams.get('strava'),
        ).toBe('unavailable');
      });
    });
  });
});
