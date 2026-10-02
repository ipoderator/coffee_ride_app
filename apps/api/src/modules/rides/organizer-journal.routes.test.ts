import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-173 («Журнал организатора»): the organizer facts embedded on
// `GET /v1/rides/:id`. A real Postgres, same cleanup order as
// `reviews.routes.test.ts` (rides before users).
const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'a-strong-password-123';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: getTestDatabaseUrl(),
  WEB_ORIGIN,
});

type App = Awaited<ReturnType<typeof buildApp>>;

async function registerOrganizer(app: App) {
  const email = `${randomUUID()}@example.test`;
  const register = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  const token = new URL(
    register.json().verificationUrl,
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
  const cookie = login.cookies.find((c) => c.name === 'session')!.value;
  await app.inject({
    method: 'POST',
    url: '/v1/organizers/me',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: cookie },
    payload: { name: 'Гравийный клуб' },
  });
  return cookie;
}

async function createRide(
  app: App,
  cookie: string,
  bicycleType: 'road' | 'gravel' | 'mtb' | 'any',
) {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/rides',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: cookie },
    payload: {
      title: 'Заезд',
      bicycleType,
      startsAt: '2027-05-01T05:00:00.000Z',
      startTimezone: 'Europe/Moscow',
    },
  });
  return response.json().ride.id as string;
}

async function setRide(
  app: App,
  rideId: string,
  status: string,
  paceKmh: number | null,
  distanceKm: number | null,
) {
  await app.db.execute(
    sql`UPDATE rides SET status = ${status}::ride_status, pace_kmh = ${paceKmh}, distance_km = ${distanceKm} WHERE id = ${rideId}`,
  );
}

async function journalOf(app: App, rideId: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/v1/rides/${rideId}`,
  });
  expect(response.statusCode).toBe(200);
  return response.json().organizer.journal;
}

describe('Organizer journal (CR-173)', () => {
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

  it('is empty, never a made-up zero percent, for an organizer with no closed rides', async () => {
    const app = await buildApp(testEnv);
    const cookie = await registerOrganizer(app);
    const rideId = await createRide(app, cookie, 'gravel');
    await setRide(app, rideId, 'published', null, null);

    expect(await journalOf(app, rideId)).toEqual({
      finishedCount: 0,
      cancelledCount: 0,
      completionPercent: null,
      typicalPaceKmh: null,
      typicalDistanceKm: null,
      bicycleTypes: [],
    });
    await app.close();
  });

  it('summarises finished and cancelled rides, ignoring drafts and upcoming ones', async () => {
    const app = await buildApp(testEnv);
    const cookie = await registerOrganizer(app);
    const viewed = await createRide(app, cookie, 'gravel');
    await setRide(app, viewed, 'registration_open', null, null);

    for (const [type, pace, km] of [
      ['gravel', 24, 60],
      ['gravel', 28, 80],
      ['road', 30, 100],
    ] as const) {
      await setRide(
        app,
        await createRide(app, cookie, type),
        'finished',
        pace,
        km,
      );
    }
    await setRide(
      app,
      await createRide(app, cookie, 'mtb'),
      'cancelled',
      40,
      200,
    );
    // a draft with a wild pace must change nothing
    await setRide(app, await createRide(app, cookie, 'mtb'), 'draft', 99, 999);

    expect(await journalOf(app, viewed)).toEqual({
      finishedCount: 3,
      cancelledCount: 1,
      completionPercent: 75,
      // median of 24/28/30 and 60/80/100 — cancelled/draft values excluded
      typicalPaceKmh: 28,
      typicalDistanceKm: 80,
      bicycleTypes: ['gravel', 'road'],
    });
    await app.close();
  });

  it('withholds the percentage until three rides are closed', async () => {
    const app = await buildApp(testEnv);
    const cookie = await registerOrganizer(app);
    const viewed = await createRide(app, cookie, 'road');
    await setRide(app, viewed, 'published', null, null);
    await setRide(
      app,
      await createRide(app, cookie, 'road'),
      'finished',
      null,
      null,
    );
    await setRide(
      app,
      await createRide(app, cookie, 'road'),
      'cancelled',
      null,
      null,
    );

    const journal = await journalOf(app, viewed);
    expect(journal).toMatchObject({
      finishedCount: 1,
      cancelledCount: 1,
      completionPercent: null,
      typicalPaceKmh: null,
    });
    await app.close();
  });

  it('breaks a tie between bicycle types alphabetically and leaves "any" out', async () => {
    const app = await buildApp(testEnv);
    const cookie = await registerOrganizer(app);
    const viewed = await createRide(app, cookie, 'road');
    await setRide(app, viewed, 'published', null, null);
    for (const type of ['road', 'mtb', 'gravel', 'any'] as const) {
      await setRide(
        app,
        await createRide(app, cookie, type),
        'finished',
        null,
        null,
      );
    }

    expect((await journalOf(app, viewed)).bicycleTypes).toEqual([
      'gravel',
      'mtb',
    ]);
    await app.close();
  });
});
