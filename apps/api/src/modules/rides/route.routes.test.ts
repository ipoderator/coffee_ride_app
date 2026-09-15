import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// CR-027 ("GPX upload"): mocks the S3 wire call only (`S3Client.prototype.send`) —
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

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required to run apps/api tests (route.routes.test.ts needs a real, migrated Postgres database).',
  );
}

const WEB_ORIGIN = 'http://localhost:3000';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: process.env.DATABASE_URL,
  WEB_ORIGIN,
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_BUCKET: 'coffee-ride-test',
});

// Same env, but no S3_* at all — `plugins/s3.ts` decorates `app.s3` as `null`,
// exercising the "S3 not configured" branch of the degraded-storage response
// without needing the mock to simulate a failure.
const testEnvNoS3 = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: process.env.DATABASE_URL,
  WEB_ORIGIN,
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

const VALID_GPX =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<gpx version="1.1" creator="test"><trk><trkseg>' +
  '<trkpt lat="55.7500" lon="37.6000"><ele>100</ele></trkpt>' +
  '<trkpt lat="55.7545" lon="37.6000"><ele>150</ele></trkpt>' +
  '</trkseg></trk></gpx>';

function multipartGpxBody(content: string, filename = 'route.gpx') {
  const boundary = `----testboundary${randomUUID()}`;
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    'Content-Type: application/gpx+xml\r\n\r\n' +
    `${content}\r\n` +
    `--${boundary}--\r\n`;
  return {
    body: Buffer.from(body),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

describe('/v1/rides/:id/route', () => {
  const s3Store = new Map<string, Buffer>();

  beforeEach(async () => {
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
        if (!data) {
          throw new Error('NoSuchKey');
        }
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

  afterAll(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  describe('POST /v1/rides/:id/route', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const { body, contentType } = multipartGpxBody(VALID_GPX);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a non-existent ride with 404', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const { body, contentType } = multipartGpxBody(VALID_GPX);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it("rejects a stranger's ride with 404", async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await registerAndLogin(app);
      const { rawToken: strangerToken } = await registerAndLogin(app);
      const { body, contentType } = multipartGpxBody(VALID_GPX);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: strangerToken },
        payload: body,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('rejects a missing file with 400 gpx_file_missing', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const boundary = `----testboundary${randomUUID()}`;

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: {
          origin: WEB_ORIGIN,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        cookies: { session: rawToken },
        payload: Buffer.from(`--${boundary}--\r\n`),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('gpx_file_missing');
      await app.close();
    });

    it('rejects a malformed GPX file with 400 gpx_invalid', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartGpxBody('not gpx at all');

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('gpx_invalid');
      await app.close();
    });

    it('rejects an upload larger than the size cap with 400 gpx_file_too_large', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      // ADR-015's cap is 10 MB — pad past it with harmless whitespace inside a
      // technically-still-malformed body (rejected for size before content is
      // ever parsed).
      const oversized = 'x'.repeat(10 * 1024 * 1024 + 1024);
      const { body, contentType } = multipartGpxBody(oversized);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('gpx_file_too_large');
      await app.close();
    }, 20000);

    it('uploads a valid GPX, computing distance/elevation/point count', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartGpxBody(VALID_GPX);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      const route = response.json().route;
      expect(route.rideId).toBe(rideId);
      expect(route.gpxFileName).toBe('route.gpx');
      expect(route.pointCount).toBe(2);
      expect(route.elevationGainMeters).toBe(50);
      expect(route.distanceKm).toBeGreaterThan(0);
      expect(sendMock).toHaveBeenCalled();

      // Cross-checked against the ride detail response (`GET /v1/rides/:id`'s
      // additive `route` field), not just the upload response.
      const detail = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
        cookies: { session: rawToken },
      });
      expect(detail.json().route.id).toBe(route.id);

      await app.close();
    });

    it('rejects a second upload with 409 route_already_exists', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const first = multipartGpxBody(VALID_GPX);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': first.contentType },
        cookies: { session: rawToken },
        payload: first.body,
      });

      const second = multipartGpxBody(VALID_GPX);
      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': second.contentType },
        cookies: { session: rawToken },
        payload: second.body,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('route_already_exists');
      await app.close();
    });

    it('rejects upload once the ride has left draft with 409 ride_not_editable', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });
      const { body, contentType } = multipartGpxBody(VALID_GPX);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_editable');
      await app.close();
    });

    it('returns 503 route_storage_unavailable when S3 is not configured', async () => {
      const app = await buildApp(testEnvNoS3);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartGpxBody(VALID_GPX);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('route_storage_unavailable');
      await app.close();
    });

    it('returns 503 route_storage_unavailable when the S3 call fails', async () => {
      sendMock.mockRejectedValue(new Error('simulated S3 outage'));
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartGpxBody(VALID_GPX);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('route_storage_unavailable');
      // ADR-015/resilience.md's bounded retry: exactly one retry (2 attempts).
      expect(sendMock).toHaveBeenCalledTimes(2);
      await app.close();
    });
  });

  describe('PATCH /v1/rides/:id/route', () => {
    it('returns 404 route_not_found when no route exists yet', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartGpxBody(VALID_GPX);

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('route_not_found');
      await app.close();
    });

    it('replaces the file and recomputed metrics, deleting the old object', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const first = multipartGpxBody(VALID_GPX, 'first.gpx');
      const created = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': first.contentType },
        cookies: { session: rawToken },
        payload: first.body,
      });
      const firstRouteId = created.json().route.id;
      expect(s3Store.size).toBe(1);

      const singlePointGpx =
        '<?xml version="1.0"?><gpx><trk><trkseg>' +
        '<trkpt lat="55.0" lon="37.0"><ele>10</ele></trkpt>' +
        '</trkseg></trk></gpx>';
      const second = multipartGpxBody(singlePointGpx, 'second.gpx');
      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': second.contentType },
        cookies: { session: rawToken },
        payload: second.body,
      });

      expect(response.statusCode).toBe(200);
      const route = response.json().route;
      expect(route.id).toBe(firstRouteId);
      expect(route.gpxFileName).toBe('second.gpx');
      expect(route.pointCount).toBe(1);
      // Best-effort delete of the old S3 object after the DB row is updated.
      expect(s3Store.size).toBe(1);

      await app.close();
    });
  });

  describe('DELETE /v1/rides/:id/route', () => {
    it('returns 404 route_not_found when no route exists yet', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('route_not_found');
      await app.close();
    });

    it('deletes the route row and the S3 object', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartGpxBody(VALID_GPX);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });
      expect(s3Store.size).toBe(1);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(204);
      expect(s3Store.size).toBe(0);

      const detail = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
        cookies: { session: rawToken },
      });
      expect(detail.json().route).toBeNull();

      await app.close();
    });
  });

  describe('GET /v1/rides/:id/route/download', () => {
    it('lets the owner download a draft ride’s route', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartGpxBody(VALID_GPX, 'my-route.gpx');
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/route/download`,
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-disposition']).toContain('my-route.gpx');
      expect(response.body).toBe(VALID_GPX);
      await app.close();
    });

    it("hides a stranger's draft ride route with 404", async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartGpxBody(VALID_GPX);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });
      const { rawToken: strangerToken } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/route/download`,
        cookies: { session: strangerToken },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('lets any viewer download a published ride’s route without a session', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartGpxBody(VALID_GPX);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/route/download`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(VALID_GPX);
      await app.close();
    });
  });

  describe('GET /v1/rides/:id/route/geometry', () => {
    it('returns 404 ride_not_found for a non-existent id (no cookie)', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${randomUUID()}/route/geometry`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('returns 404 route_not_found when no route has been uploaded yet', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/route/geometry`,
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('route_not_found');
      await app.close();
    });

    it('lets the owner read a draft ride’s geometry', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartGpxBody(VALID_GPX);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/route/geometry`,
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      const { points } = response.json();
      expect(points).toHaveLength(2);
      expect(points[0]).toEqual({
        lat: 55.75,
        lng: 37.6,
        elevationMeters: 100,
      });
      expect(points[1]).toEqual({
        lat: 55.7545,
        lng: 37.6,
        elevationMeters: 150,
      });
      await app.close();
    });

    it("hides a stranger's draft ride geometry with 404", async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartGpxBody(VALID_GPX);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });
      const { rawToken: strangerToken } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/route/geometry`,
        cookies: { session: strangerToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('lets any viewer read a published ride’s geometry without a session', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartGpxBody(VALID_GPX);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/route`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/route/geometry`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().points).toHaveLength(2);
      await app.close();
    });
  });
});
