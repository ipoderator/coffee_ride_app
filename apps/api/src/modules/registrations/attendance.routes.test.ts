import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-181 ("Finish self-check-in"): the participant's claim, the organizer's selective
// and batch confirmation, no-show marks, and the review gate they feed. Real Postgres,
// same rationale as `registrations.routes.test.ts`.
const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'a-strong-password-123';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: getTestDatabaseUrl(),
  WEB_ORIGIN,
});

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
  return login.cookies.find((c) => c.name === 'session')!.value;
}

function call(
  app: App,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  url: string,
  session: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: { origin: WEB_ORIGIN },
    cookies: { session },
    ...(payload ? { payload } : {}),
  });
}

/** An organizer with a ride advanced through `steps` after publishing. */
async function createRide(app: App, steps: string[]) {
  const organizer = await registerAndLoginUser(app);
  await call(app, 'POST', '/v1/organizers/me', organizer, {
    name: 'Гравийный клуб',
  });
  const ride = await call(app, 'POST', '/v1/rides', organizer, {
    title: 'Маршрут выходного дня',
    bicycleType: 'road',
    startsAt: '2027-05-01T05:00:00.000Z',
    startTimezone: 'Europe/Moscow',
  });
  const rideId = ride.json().ride.id as string;
  for (const step of ['publish', 'open-registration']) {
    await call(app, 'POST', `/v1/rides/${rideId}/${step}`, organizer);
  }
  return {
    organizer,
    rideId,
    advance: async (list: string[]) => {
      for (const step of list) {
        const res = await call(
          app,
          'POST',
          `/v1/rides/${rideId}/${step}`,
          organizer,
        );
        expect(res.statusCode).toBe(200);
      }
    },
    steps,
  };
}

async function joinRide(app: App, rideId: string) {
  const session = await registerAndLoginUser(app);
  const res = await call(app, 'POST', `/v1/rides/${rideId}/register`, session);
  expect(res.statusCode).toBe(201);
  return { session, registrationId: res.json().registration.id as string };
}

async function participants(app: App, rideId: string, organizer: string) {
  const res = await call(
    app,
    'GET',
    `/v1/rides/${rideId}/participants`,
    organizer,
  );
  return res.json().items as Array<{
    id: string;
    finishClaimedAt: string | null;
    attendance: string | null;
  }>;
}

const START = ['close-registration', 'start'];

describe('finish self-check-in (CR-181)', () => {
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

  describe('POST/DELETE /v1/rides/:id/finish-claim', () => {
    it('is refused before the ride has started (409 ride_not_in_progress)', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createRide(app, []);
      const rider = await joinRide(app, rideId);

      const res = await call(
        app,
        'POST',
        `/v1/rides/${rideId}/finish-claim`,
        rider.session,
      );
      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('ride_not_in_progress');
      await app.close();
    });

    it('records a claim, never a decision, and is idempotent', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const rider = await joinRide(app, ride.rideId);
      await ride.advance(START);

      const first = await call(
        app,
        'POST',
        `/v1/rides/${ride.rideId}/finish-claim`,
        rider.session,
      );
      expect(first.statusCode).toBe(200);
      const claimedAt = first.json().registration.finishClaimedAt as string;
      expect(claimedAt).toEqual(expect.any(String));
      expect(first.json().registration.attendance).toBeNull();

      const again = await call(
        app,
        'POST',
        `/v1/rides/${ride.rideId}/finish-claim`,
        rider.session,
      );
      expect(again.json().registration.finishClaimedAt).toBe(claimedAt);
      await app.close();
    });

    it('404s for a caller without an active registration', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      await ride.advance(START);
      const stranger = await registerAndLoginUser(app);

      const res = await call(
        app,
        'POST',
        `/v1/rides/${ride.rideId}/finish-claim`,
        stranger,
      );
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('registration_not_found');
      await app.close();
    });

    it('requires a session', async () => {
      const app = await buildApp(testEnv);
      const res = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/finish-claim`,
        headers: { origin: WEB_ORIGIN },
      });
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it('withdraws a claim, but not once the organizer has decided', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const rider = await joinRide(app, ride.rideId);
      await ride.advance(START);
      const url = `/v1/rides/${ride.rideId}/finish-claim`;

      await call(app, 'POST', url, rider.session);
      const withdrawn = await call(app, 'DELETE', url, rider.session);
      expect(withdrawn.statusCode).toBe(204);
      expect(
        (await participants(app, ride.rideId, ride.organizer))[0],
      ).toMatchObject({
        finishClaimedAt: null,
      });

      await call(app, 'POST', url, rider.session);
      await call(
        app,
        'PUT',
        `/v1/rides/${ride.rideId}/attendance`,
        ride.organizer,
        {
          registrationIds: [rider.registrationId],
          attendance: 'no_show',
        },
      );
      const refused = await call(app, 'DELETE', url, rider.session);
      expect(refused.statusCode).toBe(409);
      expect(refused.json().code).toBe('attendance_already_decided');
      await app.close();
    });
  });

  describe('organizer confirmation', () => {
    it('confirms only the claimed, undecided riders in one batch', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const claimed1 = await joinRide(app, ride.rideId);
      const claimed2 = await joinRide(app, ride.rideId);
      const silent = await joinRide(app, ride.rideId);
      const noShow = await joinRide(app, ride.rideId);
      await ride.advance(START);
      for (const rider of [claimed1, claimed2, noShow]) {
        await call(
          app,
          'POST',
          `/v1/rides/${ride.rideId}/finish-claim`,
          rider.session,
        );
      }
      await call(
        app,
        'PUT',
        `/v1/rides/${ride.rideId}/attendance`,
        ride.organizer,
        {
          registrationIds: [noShow.registrationId],
          attendance: 'no_show',
        },
      );

      const res = await call(
        app,
        'POST',
        `/v1/rides/${ride.rideId}/attendance/confirm-claimed`,
        ride.organizer,
      );
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ updated: 2 });

      const byId = new Map(
        (await participants(app, ride.rideId, ride.organizer)).map((p) => [
          p.id,
          p,
        ]),
      );
      expect(byId.get(claimed1.registrationId)?.attendance).toBe('finished');
      expect(byId.get(claimed2.registrationId)?.attendance).toBe('finished');
      expect(byId.get(silent.registrationId)?.attendance).toBeNull();
      expect(byId.get(noShow.registrationId)?.attendance).toBe('no_show');

      const repeat = await call(
        app,
        'POST',
        `/v1/rides/${ride.rideId}/attendance/confirm-claimed`,
        ride.organizer,
      );
      expect(repeat.json()).toEqual({ updated: 0 });
      await app.close();
    });

    it('sets, changes and clears a mark on selected riders, with attribution', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const rider = await joinRide(app, ride.rideId);
      await ride.advance(START);
      const url = `/v1/rides/${ride.rideId}/attendance`;

      const confirm = await call(app, 'PUT', url, ride.organizer, {
        registrationIds: [rider.registrationId, rider.registrationId],
        attendance: 'finished',
      });
      expect(confirm.json()).toEqual({ updated: 1 });
      const [row] = await app.db.execute<{
        attendance: string;
        marked_at: Date | null;
        marked_by: string | null;
      }>(
        sql`select attendance, attendance_marked_at as marked_at, attendance_marked_by as marked_by from registrations where id = ${rider.registrationId}`,
      );
      expect(row?.attendance).toBe('finished');
      expect(row?.marked_at).not.toBeNull();
      expect(row?.marked_by).not.toBeNull();

      const cleared = await call(app, 'PUT', url, ride.organizer, {
        registrationIds: [rider.registrationId],
        attendance: null,
      });
      expect(cleared.json()).toEqual({ updated: 1 });
      expect(
        (await participants(app, ride.rideId, ride.organizer))[0]?.attendance,
      ).toBeNull();
      await app.close();
    });

    it('rejects the whole batch when one id is not an active registration of this ride', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const rider = await joinRide(app, ride.rideId);
      const other = await createRide(app, START);
      const outsider = await joinRide(app, other.rideId);
      await ride.advance(START);

      const res = await call(
        app,
        'PUT',
        `/v1/rides/${ride.rideId}/attendance`,
        ride.organizer,
        {
          registrationIds: [rider.registrationId, outsider.registrationId],
          attendance: 'finished',
        },
      );
      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('participant_not_found');
      expect(
        (await participants(app, ride.rideId, ride.organizer))[0]?.attendance,
      ).toBeNull();
      await app.close();
    });

    it('does not touch a cancelled registration', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const rider = await joinRide(app, ride.rideId);
      await call(
        app,
        'DELETE',
        `/v1/rides/${ride.rideId}/register`,
        rider.session,
      );
      await ride.advance(START);

      const res = await call(
        app,
        'PUT',
        `/v1/rides/${ride.rideId}/attendance`,
        ride.organizer,
        { registrationIds: [rider.registrationId], attendance: 'no_show' },
      );
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it('is owner-only: a non-owner (even an organizer) gets 404, a participant too', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const rider = await joinRide(app, ride.rideId);
      const otherOrganizer = (await createRide(app, START)).organizer;
      await ride.advance(START);

      for (const session of [otherOrganizer, rider.session]) {
        const put = await call(
          app,
          'PUT',
          `/v1/rides/${ride.rideId}/attendance`,
          session,
          { registrationIds: [rider.registrationId], attendance: 'finished' },
        );
        expect(put.statusCode).toBe(404);
        const batch = await call(
          app,
          'POST',
          `/v1/rides/${ride.rideId}/attendance/confirm-claimed`,
          session,
        );
        expect(batch.statusCode).toBe(404);
      }
      expect(
        (await participants(app, ride.rideId, ride.organizer))[0]?.attendance,
      ).toBeNull();
      await app.close();
    });

    it('is refused before the start (409) and validates the body (400)', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, []);
      const rider = await joinRide(app, ride.rideId);
      const url = `/v1/rides/${ride.rideId}/attendance`;

      const early = await call(app, 'PUT', url, ride.organizer, {
        registrationIds: [rider.registrationId],
        attendance: 'finished',
      });
      expect(early.statusCode).toBe(409);
      expect(early.json().code).toBe('ride_not_in_progress');

      const empty = await call(app, 'PUT', url, ride.organizer, {
        registrationIds: [],
        attendance: 'finished',
      });
      expect(empty.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('review gate', () => {
    it('lets only an organizer-confirmed finisher review (claim, silence and no-show cannot)', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const confirmed = await joinRide(app, ride.rideId);
      const claimedOnly = await joinRide(app, ride.rideId);
      const noShow = await joinRide(app, ride.rideId);
      await ride.advance([...START, 'finish']);
      await call(
        app,
        'POST',
        `/v1/rides/${ride.rideId}/finish-claim`,
        claimedOnly.session,
      );
      await call(
        app,
        'PUT',
        `/v1/rides/${ride.rideId}/attendance`,
        ride.organizer,
        {
          registrationIds: [confirmed.registrationId],
          attendance: 'finished',
        },
      );
      await call(
        app,
        'PUT',
        `/v1/rides/${ride.rideId}/attendance`,
        ride.organizer,
        {
          registrationIds: [noShow.registrationId],
          attendance: 'no_show',
        },
      );
      const reviewUrl = `/v1/rides/${ride.rideId}/reviews`;
      const payload = { rating: 5 };

      const ok = await call(app, 'POST', reviewUrl, confirmed.session, payload);
      expect(ok.statusCode).toBe(201);
      for (const rider of [claimedOnly, noShow]) {
        const res = await call(app, 'POST', reviewUrl, rider.session, payload);
        expect(res.statusCode).toBe(403);
        expect(res.json().code).toBe('finish_not_confirmed');
      }
      await app.close();
    });

    it('still accepts a claim and a confirmation after the ride is finished', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const rider = await joinRide(app, ride.rideId);
      await ride.advance([...START, 'finish']);

      const claim = await call(
        app,
        'POST',
        `/v1/rides/${ride.rideId}/finish-claim`,
        rider.session,
      );
      expect(claim.statusCode).toBe(200);
      const batch = await call(
        app,
        'POST',
        `/v1/rides/${ride.rideId}/attendance/confirm-claimed`,
        ride.organizer,
      );
      expect(batch.json()).toEqual({ updated: 1 });
      await app.close();
    });
  });
  describe('«сошёл» and the closing summary (CR-182)', () => {
    async function summaryOf(app: App, rideId: string, session: string) {
      const res = await call(app, 'GET', `/v1/rides/${rideId}`, session);
      return res.json().attendanceSummary as {
        finished: number;
        dnf: number;
        noShow: number;
        unresolved: number;
      } | null;
    }

    it('records «сошёл» as its own outcome, which cannot review', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const rider = await joinRide(app, ride.rideId);
      await ride.advance([...START, 'finish']);

      const res = await call(
        app,
        'PUT',
        `/v1/rides/${ride.rideId}/attendance`,
        ride.organizer,
        {
          registrationIds: [rider.registrationId],
          attendance: 'dnf',
        },
      );
      expect(res.json()).toEqual({ updated: 1 });
      expect(
        (await participants(app, ride.rideId, ride.organizer))[0]?.attendance,
      ).toBe('dnf');

      const review = await call(
        app,
        'POST',
        `/v1/rides/${ride.rideId}/reviews`,
        rider.session,
        {
          rating: 4,
        },
      );
      expect(review.statusCode).toBe(403);
      expect(review.json().code).toBe('finish_not_confirmed');
      await app.close();
    });

    it('has no summary before the start', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, []);
      await joinRide(app, ride.rideId);
      expect(await summaryOf(app, ride.rideId, ride.organizer)).toBeNull();
      await app.close();
    });

    it('counts each outcome, and a ride closed with undecided riders still shows them', async () => {
      const app = await buildApp(testEnv);
      const ride = await createRide(app, START);
      const done = await joinRide(app, ride.rideId);
      const dropped = await joinRide(app, ride.rideId);
      const absent = await joinRide(app, ride.rideId);
      await joinRide(app, ride.rideId);
      await ride.advance(START);
      const put = (id: string, attendance: string) =>
        call(
          app,
          'PUT',
          `/v1/rides/${ride.rideId}/attendance`,
          ride.organizer,
          {
            registrationIds: [id],
            attendance,
          },
        );
      await put(done.registrationId, 'finished');
      await put(dropped.registrationId, 'dnf');
      await put(absent.registrationId, 'no_show');

      // Closing is allowed with one rider undecided — and says so, publicly.
      await ride.advance(['finish']);
      const anonymous = await app.inject({
        method: 'GET',
        url: `/v1/rides/${ride.rideId}`,
      });
      expect(anonymous.json().ride.status).toBe('finished');
      expect(anonymous.json().attendanceSummary).toEqual({
        finished: 1,
        dnf: 1,
        noShow: 1,
        unresolved: 1,
      });
      await app.close();
    });
  });
});
