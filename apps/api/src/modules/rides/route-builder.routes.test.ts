import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-114 ("Route builder"). Mocks the two wire boundaries only — S3's
// `S3Client.prototype.send` and 2GIS's `fetch` — so the real
// `plugins/maps.ts` → `maps-2gis` adapter → `rides.service.ts` path runs.
//
// Original CR-027 note: mocks the S3 wire call only (`S3Client.prototype.send`) —
// same technique CR-008 used for `packages/maps-2gis`'s `fetch` — so this suite runs
// without a live MinIO (KI-015/KI-019, Docker unreachable in this environment) while
// still exercising the real `route-storage.ts`/`rides.service.ts` code paths.
const sendMock = vi.fn();
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  class MockS3Client {
    send(...args: unknown[]) {
      return sendMock(...args);
    }
  }
  return {
    ...actual,
    S3Client: MockS3Client,
  };
});

const { buildApp } = await import('../../app.js');
const { loadEnv } = await import('../../env.js');

const DATABASE_URL = getTestDatabaseUrl();

const WEB_ORIGIN = 'http://localhost:3000';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
  WEB_ORIGIN,
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_BUCKET: 'coffee-ride-test',
  MAPS_2GIS_API_KEY: 'test-2gis-key',
});

// No `MAPS_2GIS_API_KEY` — `plugins/maps.ts` decorates `app.mapProvider` as `null`.
const testEnvNoMaps = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
  WEB_ORIGIN,
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_BUCKET: 'coffee-ride-test',
});

function uniqueEmail() {
  return `${randomUUID()}@example.test`;
}

const PASSWORD = 'a-strong-password-123';

function sessionCookie(
  response: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>,
) {
  return response.cookies.find((c) => c.name === 'session');
}

async function registerAndLogin(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = uniqueEmail();
  const register = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  const verificationUrl: string = register.json().verificationUrl;
  const token = new URL(verificationUrl, 'http://internal').searchParams.get(
    'token',
  );
  await app.inject({
    method: 'POST',
    url: '/v1/auth/verify-email',
    headers: { origin: WEB_ORIGIN },
    payload: { token },
  });
  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  const rawToken = sessionCookie(login)!.value;

  await app.inject({
    method: 'POST',
    url: '/v1/organizers/me',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: rawToken },
    payload: { name: 'Гравийный клуб' },
  });

  const ride = await app.inject({
    method: 'POST',
    url: '/v1/rides',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: rawToken },
    payload: {
      title: 'Маршрут выходного дня',
      bicycleType: 'gravel',
      startsAt: '2027-05-01T05:00:00.000Z',
      startTimezone: 'Europe/Moscow',
    },
  });

  return { rawToken, rideId: ride.json().ride.id as string };
}

// A 2GIS Routing answer: one maneuver whose path bends (it follows a road,
// unlike the straight line between the two requested points).
function routingAnswer({ withAltitudes }: { withAltitudes: boolean }) {
  const selection = withAltitudes
    ? 'LINESTRING Z(37.6000 55.7500 100, 37.6100 55.7550 130, 37.6000 55.7600 120)'
    : 'LINESTRING(37.6000 55.7500, 37.6100 55.7550, 37.6000 55.7600)';
  return [
    {
      total_distance: 1500,
      total_duration: 400,
      maneuvers: [{ outcoming_path: { geometry: [{ selection }] } }],
    },
  ];
}

function stub2Gis(answer: { status?: number; body?: unknown }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: (answer.status ?? 200) < 400,
    status: answer.status ?? 200,
    json: async () => answer.body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const WAYPOINTS = [
  { lat: 55.75, lng: 37.6 },
  { lat: 55.76, lng: 37.6 },
];

describe('POST /v1/rides/:id/route/build', () => {
  const s3Store = new Map<string, Buffer>();

  beforeEach(async () => {
    vi.unstubAllGlobals();
    s3Store.clear();
    sendMock.mockReset();
    sendMock.mockImplementation(async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        s3Store.set(
          command.input.Key as string,
          Buffer.from(command.input.Body as Buffer),
        );
        return {};
      }
      if (command instanceof DeleteObjectCommand) {
        s3Store.delete(command.input.Key as string);
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const data = s3Store.get(command.input.Key as string);
        if (!data) throw new Error('NoSuchKey');
        return {
          ContentType: 'application/gpx+xml',
          Body: { transformToByteArray: async () => data },
        };
      }
      throw new Error(`Unexpected S3 command: ${String(command)}`);
    });

    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  async function build(
    app: Awaited<ReturnType<typeof buildApp>>,
    rawToken: string | undefined,
    rideId: string,
    points: unknown = WAYPOINTS,
  ) {
    return app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/route/build`,
      headers: { origin: WEB_ORIGIN },
      cookies: rawToken ? { session: rawToken } : {},
      payload: { points },
    });
  }

  it('routes the waypoints through 2GIS (bicycle) and stores the road-following line', async () => {
    const app = await buildApp(testEnv);
    const { rawToken, rideId } = await registerAndLogin(app);
    const fetchMock = stub2Gis({
      body: routingAnswer({ withAltitudes: true }),
    });

    const response = await build(app, rawToken, rideId);

    expect(response.statusCode).toBe(200);
    const { route } = response.json();
    expect(route).toMatchObject({
      gpxFileName: 'route-2gis.gpx',
      pointCount: 3,
    });
    expect(route.distanceKm).toBeGreaterThan(0);
    expect(route.elevationGainMeters).toBe(30);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('routing.api.2gis.com');
    expect(JSON.parse(init.body)).toMatchObject({
      transport: 'bicycle',
      need_altitudes: true,
      points: [
        { lat: 55.75, lon: 37.6, type: 'stop' },
        { lat: 55.76, lon: 37.6, type: 'stop' },
      ],
    });

    // The stored geometry is 2GIS's bent path, not the straight request line.
    const geometry = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/route/geometry`,
      cookies: { session: rawToken },
    });
    expect(geometry.json().points).toEqual([
      { lat: 55.75, lng: 37.6, elevationMeters: 100 },
      { lat: 55.755, lng: 37.61, elevationMeters: 130 },
      { lat: 55.76, lng: 37.6, elevationMeters: 120 },
    ]);

    // Stored as a real GPX file too, so download keeps working.
    const download = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/route/download`,
      cookies: { session: rawToken },
    });
    expect(download.statusCode).toBe(200);
    expect(download.body).toContain('<trkpt lat="55.755" lon="37.61">');

    // Same auto-fill rule as a GPX upload: still-null ride metrics get filled.
    const ride = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}`,
      cookies: { session: rawToken },
    });
    expect(ride.json().ride.distanceKm).toBe(route.distanceKm);
    expect(ride.json().ride.elevationGainMeters).toBe(30);
    await app.close();
  });

  it('replaces an existing route on rebuild and deletes the old file', async () => {
    const app = await buildApp(testEnv);
    const { rawToken, rideId } = await registerAndLogin(app);
    stub2Gis({ body: routingAnswer({ withAltitudes: true }) });

    await build(app, rawToken, rideId);
    const firstKeys = [...s3Store.keys()];
    const second = await build(app, rawToken, rideId);

    expect(second.statusCode).toBe(200);
    expect(s3Store.size).toBe(1);
    expect(firstKeys.some((key) => s3Store.has(key))).toBe(false);
    await app.close();
  });

  it('never fabricates an elevation: no altitudes from 2GIS leaves the ride elevation empty', async () => {
    const app = await buildApp(testEnv);
    const { rawToken, rideId } = await registerAndLogin(app);
    stub2Gis({ body: routingAnswer({ withAltitudes: false }) });

    const response = await build(app, rawToken, rideId);
    expect(response.statusCode).toBe(200);

    const ride = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}`,
      cookies: { session: rawToken },
    });
    expect(ride.json().ride.distanceKm).not.toBeNull();
    expect(ride.json().ride.elevationGainMeters).toBeNull();
    await app.close();
  });

  it('answers 422 route_not_buildable when 2GIS has no road path — and stores nothing', async () => {
    const app = await buildApp(testEnv);
    const { rawToken, rideId } = await registerAndLogin(app);
    // A route item with no geometry: the adapter used to return the raw
    // waypoints here (a straight line across whatever lies between them).
    stub2Gis({ body: [{ total_distance: 1000, total_duration: 100 }] });

    const response = await build(app, rawToken, rideId);

    expect(response.statusCode).toBe(422);
    expect(response.json().code).toBe('route_not_buildable');
    expect(s3Store.size).toBe(0);
    const ride = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}`,
      cookies: { session: rawToken },
    });
    expect(ride.json().route).toBeNull();
    await app.close();
  });

  it('answers 503 route_builder_unavailable when 2GIS is down', async () => {
    const app = await buildApp(testEnv);
    const { rawToken, rideId } = await registerAndLogin(app);
    stub2Gis({ status: 502 });

    const response = await build(app, rawToken, rideId);

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('route_builder_unavailable');
    await app.close();
  });

  it('answers 503 route_builder_unavailable when no 2GIS key is configured', async () => {
    const app = await buildApp(testEnvNoMaps);
    const { rawToken, rideId } = await registerAndLogin(app);
    const fetchMock = stub2Gis({
      body: routingAnswer({ withAltitudes: true }),
    });

    const response = await build(app, rawToken, rideId);

    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('route_builder_unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects fewer than two points with a validation error', async () => {
    const app = await buildApp(testEnv);
    const { rawToken, rideId } = await registerAndLogin(app);

    const response = await build(app, rawToken, rideId, [WAYPOINTS[0]]);

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');
    await app.close();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const app = await buildApp(testEnv);
    const { rideId } = await registerAndLogin(app);

    const response = await build(app, undefined, rideId);

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects a stranger's ride with 404, without calling 2GIS", async () => {
    const app = await buildApp(testEnv);
    const { rideId } = await registerAndLogin(app);
    const { rawToken: strangerToken } = await registerAndLogin(app);
    const fetchMock = stub2Gis({
      body: routingAnswer({ withAltitudes: true }),
    });

    const response = await build(app, strangerToken, rideId);

    expect(response.statusCode).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    await app.close();
  });
});
