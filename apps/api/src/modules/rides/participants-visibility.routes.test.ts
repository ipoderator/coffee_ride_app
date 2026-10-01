import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// KI-065: `PUT /v1/rides/:id/participants-visibility`. Real Postgres, same
// setup as `registrations.routes.test.ts`.
const DATABASE_URL = getTestDatabaseUrl();
const WEB_ORIGIN = 'http://localhost:3000';
const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
  WEB_ORIGIN,
});
const PASSWORD = 'a-strong-password-123';

type App = Awaited<ReturnType<typeof buildApp>>;

async function registerAndLoginUser(app: App) {
  const email = `${randomUUID()}@example.test`;
  const register = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  const token = new URL(
    register.json().verificationUrl as string,
    'http://internal',
  ).searchParams.get('token');
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
  return login.cookies.find((c) => c.name === 'session')!.value;
}

async function createOpenRide(app: App) {
  const organizerToken = await registerAndLoginUser(app);
  await app.inject({
    method: 'POST',
    url: '/v1/organizers/me',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: organizerToken },
    payload: { name: 'Гравийный клуб' },
  });
  const ride = await app.inject({
    method: 'POST',
    url: '/v1/rides',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: organizerToken },
    payload: {
      title: 'Маршрут выходного дня',
      bicycleType: 'gravel',
      startsAt: '2027-05-01T05:00:00.000Z',
      startTimezone: 'Europe/Moscow',
    },
  });
  const rideId = ride.json().ride.id as string;
  for (const step of ['publish', 'open-registration']) {
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/${step}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: organizerToken },
    });
  }
  return { organizerToken, rideId };
}

function setVisibility(
  app: App,
  rideId: string,
  token: string | null,
  payload: unknown,
) {
  return app.inject({
    method: 'PUT',
    url: `/v1/rides/${rideId}/participants-visibility`,
    headers: { origin: WEB_ORIGIN },
    ...(token ? { cookies: { session: token } } : {}),
    payload: payload as Record<string, unknown>,
  });
}

describe('PUT /v1/rides/:id/participants-visibility', () => {
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

  it('rejects a request with no session cookie with 401', async () => {
    const app = await buildApp(testEnv);
    const response = await setVisibility(app, randomUUID(), null, {
      participantsVisible: false,
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("answers 404 ride_not_found for someone else's ride", async () => {
    const app = await buildApp(testEnv);
    const { rideId } = await createOpenRide(app);
    const stranger = await registerAndLoginUser(app);

    const response = await setVisibility(app, rideId, stranger, {
      participantsVisible: false,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('ride_not_found');
    await app.close();
  });

  it('rejects a body without a boolean with 400', async () => {
    const app = await buildApp(testEnv);
    const { organizerToken, rideId } = await createOpenRide(app);

    const response = await setVisibility(app, rideId, organizerToken, {
      participantsVisible: 'yes',
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('hides the list of an open ride with registrations, and refuses to show it again', async () => {
    const app = await buildApp(testEnv);
    const { organizerToken, rideId } = await createOpenRide(app);
    const rider = await registerAndLoginUser(app);
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rider },
    });

    const hide = await setVisibility(app, rideId, organizerToken, {
      participantsVisible: false,
    });
    expect(hide.statusCode).toBe(200);
    expect(hide.json().ride.participantsVisible).toBe(false);

    const riders = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders`,
      cookies: { session: rider },
    });
    expect(riders.json().code).toBe('riders_hidden');

    const show = await setVisibility(app, rideId, organizerToken, {
      participantsVisible: true,
    });
    expect(show.statusCode).toBe(409);
    expect(show.json().code).toBe('participants_visibility_locked');

    const [row] = await app.db.execute<{ participants_visible: boolean }>(
      sql`SELECT participants_visible FROM rides WHERE id = ${rideId}::uuid`,
    );
    expect(row?.participants_visible).toBe(false);
    await app.close();
  });

  it('shows a hidden list again while nobody is registered', async () => {
    const app = await buildApp(testEnv);
    const { organizerToken, rideId } = await createOpenRide(app);

    await setVisibility(app, rideId, organizerToken, {
      participantsVisible: false,
    });
    const show = await setVisibility(app, rideId, organizerToken, {
      participantsVisible: true,
    });

    expect(show.statusCode).toBe(200);
    expect(show.json().ride.participantsVisible).toBe(true);
    await app.close();
  });

  it('treats setting the current value as a no-op, even with registrations', async () => {
    const app = await buildApp(testEnv);
    const { organizerToken, rideId } = await createOpenRide(app);
    const rider = await registerAndLoginUser(app);
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rider },
    });

    const response = await setVisibility(app, rideId, organizerToken, {
      participantsVisible: true,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().ride.participantsVisible).toBe(true);
    await app.close();
  });
});
