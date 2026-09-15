import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';

// Same rationale as `rides.routes.test.ts`/`route.routes.test.ts`: a real Postgres,
// `DELETE FROM rides` before `DELETE FROM users` (`rides.organizer_id ->
// organizer_profiles.id` is `ON DELETE RESTRICT`).
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required to run apps/api tests (stops.routes.test.ts needs a real, migrated Postgres database).',
  );
}

const WEB_ORIGIN = 'http://localhost:3000';

const testEnv = loadEnv({
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

const VALID_STOP = {
  name: 'Кофейня на набережной',
  lat: 55.751,
  lng: 37.618,
  durationMinutes: 15,
};

describe('/v1/rides/:id/stops', () => {
  beforeEach(async () => {
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

  describe('POST /v1/rides/:id/stops', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/stops`,
        headers: { origin: WEB_ORIGIN },
        payload: VALID_STOP,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a non-existent ride with 404 ride_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/stops`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_STOP,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it("rejects another organizer's ride with 404 ride_not_found", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app);
      const stranger = await registerAndLogin(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${owner.rideId}/stops`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.rawToken },
        payload: VALID_STOP,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('rejects an invalid payload with 400 validation_error', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/stops`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: '', lat: 200, lng: 37.6 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');
      await app.close();
    });

    it('rejects a mismatched Origin with 403 csrf_origin_mismatch', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/stops`,
        headers: { origin: 'https://evil.example' },
        cookies: { session: rawToken },
        payload: VALID_STOP,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');
      await app.close();
    });

    it('creates a stop at position 0, then a second at position 1', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);

      const first = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/stops`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_STOP,
      });
      expect(first.statusCode).toBe(201);
      expect(first.json().stop).toMatchObject({
        rideId,
        name: VALID_STOP.name,
        lat: VALID_STOP.lat,
        lng: VALID_STOP.lng,
        durationMinutes: 15,
        position: 0,
        description: null,
      });

      const second = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/stops`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Смотровая площадка', lat: 55.76, lng: 37.62 },
      });
      expect(second.statusCode).toBe(201);
      expect(second.json().stop.position).toBe(1);

      const detail = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
        cookies: { session: rawToken },
      });
      expect(detail.json().stops.map((s: { name: string }) => s.name)).toEqual([
        VALID_STOP.name,
        'Смотровая площадка',
      ]);

      await app.close();
    });

    it('rejects a published ride with 409 ride_not_editable', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/stops`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_STOP,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_editable');
      await app.close();
    });
  });

  describe('PATCH /v1/rides/:id/stops/:stopId', () => {
    async function createStop(
      app: Awaited<ReturnType<typeof buildApp>>,
      rawToken: string,
      rideId: string,
    ) {
      const created = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/stops`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_STOP,
      });
      return created.json().stop.id as string;
    }

    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const stopId = await createStop(app, rawToken, rideId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/stops/${stopId}`,
        headers: { origin: WEB_ORIGIN },
        payload: { name: 'Новое имя' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 404 stop_not_found for a non-existent stop id', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/stops/${randomUUID()}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Новое имя' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('stop_not_found');
      await app.close();
    });

    it("returns 404 stop_not_found for another ride's stop", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app);
      const other = await registerAndLogin(app);
      const stopId = await createStop(app, owner.rawToken, owner.rideId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${other.rideId}/stops/${stopId}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: other.rawToken },
        payload: { name: 'Новое имя' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('stop_not_found');
      await app.close();
    });

    it('updates the given fields only, leaving position unchanged', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const stopId = await createStop(app, rawToken, rideId);

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/stops/${stopId}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Обновлённое название', durationMinutes: null },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().stop).toMatchObject({
        name: 'Обновлённое название',
        durationMinutes: null,
        lat: VALID_STOP.lat,
        position: 0,
      });
      await app.close();
    });
  });

  describe('DELETE /v1/rides/:id/stops/:stopId', () => {
    async function createStop(
      app: Awaited<ReturnType<typeof buildApp>>,
      rawToken: string,
      rideId: string,
    ) {
      const created = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/stops`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_STOP,
      });
      return created.json().stop.id as string;
    }

    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const stopId = await createStop(app, rawToken, rideId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/stops/${stopId}`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 404 stop_not_found for a non-existent stop id', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/stops/${randomUUID()}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('stop_not_found');
      await app.close();
    });

    it('deletes the stop, removing it from the ride detail response', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const stopId = await createStop(app, rawToken, rideId);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/stops/${stopId}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });
      expect(response.statusCode).toBe(204);

      const detail = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
        cookies: { session: rawToken },
      });
      expect(detail.json().stops).toEqual([]);

      await app.close();
    });
  });
});
