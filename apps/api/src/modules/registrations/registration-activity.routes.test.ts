import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// KI-066: `GET /v1/rides/mine/registrations/activity`. Same real-Postgres
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
const ACTIVITY_URL = '/v1/rides/mine/registrations/activity';

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

async function createOpenRide(app: App, organizerToken: string, title: string) {
  const ride = await app.inject({
    method: 'POST',
    url: '/v1/rides',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: organizerToken },
    payload: {
      title,
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
  return rideId;
}

async function createOrganizer(app: App) {
  const token = await registerAndLoginUser(app);
  await app.inject({
    method: 'POST',
    url: '/v1/organizers/me',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: token },
    payload: { name: 'Гравийный клуб' },
  });
  return token;
}

async function register(app: App, rideId: string, token: string) {
  const response = await app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/register`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: token },
  });
  return response.json().registration.id as string;
}

async function setRegistrationCreatedAt(app: App, id: string, iso: string) {
  await app.db.execute(
    sql`UPDATE registrations SET created_at = ${iso}::timestamptz WHERE id = ${id}::uuid`,
  );
}

function getActivity(app: App, token: string | null, query: string) {
  return app.inject({
    method: 'GET',
    url: `${ACTIVITY_URL}?${query}`,
    ...(token ? { cookies: { session: token } } : {}),
  });
}

describe('GET /v1/rides/mine/registrations/activity', () => {
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
    const response = await getActivity(
      app,
      null,
      'from=2026-09-28&timeZone=Europe/Moscow',
    );
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects a malformed date or an unknown time zone with 400', async () => {
    const app = await buildApp(testEnv);
    const token = await registerAndLoginUser(app);

    const badDate = await getActivity(
      app,
      token,
      'from=28.09.2026&timeZone=Europe/Moscow',
    );
    expect(badDate.statusCode).toBe(400);
    const badZone = await getActivity(
      app,
      token,
      'from=2026-09-28&timeZone=Mars/Olympus',
    );
    expect(badZone.statusCode).toBe(400);
    await app.close();
  });

  it('returns an empty week for a caller with no organizer profile', async () => {
    const app = await buildApp(testEnv);
    const token = await registerAndLoginUser(app);

    const response = await getActivity(
      app,
      token,
      'from=2026-09-28&timeZone=Europe/Moscow',
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().activity).toEqual({
      recent: [],
      days: [
        { date: '2026-09-28', count: 0 },
        { date: '2026-09-29', count: 0 },
        { date: '2026-09-30', count: 0 },
        { date: '2026-10-01', count: 0 },
        { date: '2026-10-02', count: 0 },
        { date: '2026-10-03', count: 0 },
        { date: '2026-10-04', count: 0 },
      ],
    });
    await app.close();
  });

  it("buckets the caller's active registrations by the viewer's calendar day, newest first", async () => {
    const app = await buildApp(testEnv);
    const organizerToken = await createOrganizer(app);
    const rideId = await createOpenRide(app, organizerToken, 'Кофейный круг');
    const strangerOrganizer = await createOrganizer(app);
    const strangerRideId = await createOpenRide(
      app,
      strangerOrganizer,
      'Чужой заезд',
    );

    const riderA = await registerAndLoginUser(app);
    const riderB = await registerAndLoginUser(app);
    // 23:30 Moscow on the 28th, and 00:30 Moscow on the 29th — the same UTC day.
    const lateEvening = await register(app, rideId, riderA);
    await setRegistrationCreatedAt(app, lateEvening, '2026-09-28T20:30:00Z');
    const afterMidnight = await register(app, rideId, riderB);
    await setRegistrationCreatedAt(app, afterMidnight, '2026-09-28T21:30:00Z');
    const elsewhere = await register(app, strangerRideId, riderA);
    await setRegistrationCreatedAt(app, elsewhere, '2026-09-28T21:00:00Z');

    const moscow = await getActivity(
      app,
      organizerToken,
      'from=2026-09-28&timeZone=Europe/Moscow',
    );
    expect(moscow.statusCode).toBe(200);
    const { recent, days } = moscow.json().activity;
    expect(days.slice(0, 3)).toEqual([
      { date: '2026-09-28', count: 1 },
      { date: '2026-09-29', count: 1 },
      { date: '2026-09-30', count: 0 },
    ]);
    expect(recent.map((entry: { id: string }) => entry.id)).toEqual([
      afterMidnight,
      lateEvening,
    ]);
    expect(recent[0]).toEqual({
      id: afterMidnight,
      rideId,
      rideTitle: 'Кофейный круг',
      displayName: null,
      group: null,
      createdAt: '2026-09-28T21:30:00.000Z',
    });

    const utc = await getActivity(
      app,
      organizerToken,
      'from=2026-09-28&timeZone=UTC',
    );
    expect(utc.json().activity.days[0]).toEqual({
      date: '2026-09-28',
      count: 2,
    });
    await app.close();
  });

  it('leaves out cancelled registrations, cancelled rides and long-past rides from the feed', async () => {
    const app = await buildApp(testEnv);
    const organizerToken = await createOrganizer(app);
    const keptRide = await createOpenRide(app, organizerToken, 'Остаётся');
    const cancelledRide = await createOpenRide(app, organizerToken, 'Отменён');
    const pastRide = await createOpenRide(app, organizerToken, 'Прошёл');

    const rider = await registerAndLoginUser(app);
    const kept = await register(app, keptRide, rider);
    await register(app, cancelledRide, rider);
    const past = await register(app, pastRide, rider);
    for (const id of [kept, past]) {
      await setRegistrationCreatedAt(app, id, '2026-09-29T09:00:00Z');
    }

    const withdrawn = await registerAndLoginUser(app);
    await register(app, keptRide, withdrawn);
    await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${keptRide}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: withdrawn },
    });
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${cancelledRide}/cancel`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: organizerToken },
    });
    await app.db.execute(
      sql`UPDATE rides SET starts_at = now() - interval '30 days' WHERE id = ${pastRide}::uuid`,
    );

    const response = await getActivity(
      app,
      organizerToken,
      'from=2026-09-28&timeZone=Europe/Moscow',
    );
    const { recent, days } = response.json().activity;

    expect(recent.map((entry: { id: string }) => entry.id)).toEqual([kept]);
    // The chart counts by registration time, whatever the ride's start.
    expect(days[1]).toEqual({ date: '2026-09-29', count: 2 });
    await app.close();
  });
});
