import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';

// Same rationale as `notifications.routes.test.ts`: a real Postgres, `DELETE FROM
// rides` before `DELETE FROM users` (`rides.organizer_id -> organizer_profiles.id`
// is `ON DELETE RESTRICT`). `reviews` cascades from `rides`/`users`, so no extra
// cleanup statement is needed.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required to run apps/api tests (reviews.routes.test.ts needs a real, migrated Postgres database).',
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

/** Registers, verifies, and logs in a fresh user. No organizer profile. */
async function registerAndLoginUser(app: Awaited<ReturnType<typeof buildApp>>) {
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
  return {
    rawToken: sessionCookie(login)!.value,
    userId: login.json().user.id as string,
  };
}

/** An organizer with a published, registration-open ride. */
async function createOrganizerRide(app: Awaited<ReturnType<typeof buildApp>>) {
  const { rawToken: organizerToken } = await registerAndLoginUser(app);
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

  await app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/publish`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: organizerToken },
  });
  await app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/open-registration`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: organizerToken },
  });

  return { organizerToken, rideId };
}

/** Registers a fresh participant for the given ride, returning their session. */
async function registerParticipant(
  app: Awaited<ReturnType<typeof buildApp>>,
  rideId: string,
) {
  const participant = await registerAndLoginUser(app);
  await app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/register`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: participant.rawToken },
  });
  return participant;
}

/** Drives an already `registration_open` ride through to `finished`. */
async function finishRide(
  app: Awaited<ReturnType<typeof buildApp>>,
  organizerToken: string,
  rideId: string,
) {
  await app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/close-registration`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: organizerToken },
  });
  await app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/start`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: organizerToken },
  });
  await app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/finish`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: organizerToken },
  });
}

/** A finished ride with one active participant, ready to be reviewed. */
async function createFinishedRideWithParticipant(
  app: Awaited<ReturnType<typeof buildApp>>,
) {
  const { organizerToken, rideId } = await createOrganizerRide(app);
  const participant = await registerParticipant(app, rideId);
  await finishRide(app, organizerToken, rideId);
  return { organizerToken, rideId, participant };
}

describe('Post-ride (CR-042/CR-043)', () => {
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

  describe('POST /v1/rides/:id/reviews', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/reviews`,
        headers: { origin: WEB_ORIGIN },
        payload: { rating: 5 },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a non-existent ride with 404 ride_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { rating: 5 },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('rejects a ride that has not finished yet with 409 ride_not_finished', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const participant = await registerParticipant(app, rideId);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { rating: 5 },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_finished');
      await app.close();
    });

    it('rejects a caller with no active registration with 403 not_a_participant', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app);
      await finishRide(app, organizerToken, rideId);
      const { rawToken: strangerToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: strangerToken },
        payload: { rating: 4 },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('not_a_participant');
      await app.close();
    });

    it('rejects a cancelled registrant with 403 not_a_participant', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app);
      const participant = await registerParticipant(app, rideId);
      await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
      });
      await finishRide(app, organizerToken, rideId);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { rating: 4 },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('not_a_participant');
      await app.close();
    });

    it('rejects an out-of-range rating with 400 validation_error', async () => {
      const app = await buildApp(testEnv);
      const { rideId, participant } =
        await createFinishedRideWithParticipant(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { rating: 6 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');
      await app.close();
    });

    it('creates a review for an eligible participant on a finished ride', async () => {
      const app = await buildApp(testEnv);
      const { rideId, participant } =
        await createFinishedRideWithParticipant(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { rating: 5, comment: 'Отличный маршрут!' },
      });

      expect(response.statusCode).toBe(201);
      const review = response.json().review;
      expect(review.rideId).toBe(rideId);
      expect(review.userId).toBe(participant.userId);
      expect(review.rating).toBe(5);
      expect(review.comment).toBe('Отличный маршрут!');
      expect(review.createdAt).toEqual(expect.any(String));
      await app.close();
    });

    it('rejects a second review from the same participant with 409 review_already_exists', async () => {
      const app = await buildApp(testEnv);
      const { rideId, participant } =
        await createFinishedRideWithParticipant(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { rating: 5 },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { rating: 3 },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('review_already_exists');
      await app.close();
    });
  });

  describe('GET /v1/rides/:id/reviews', () => {
    it('rejects a non-existent ride with 404 ride_not_found', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${randomUUID()}/reviews`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('lists a ride’s reviews publicly (no session required)', async () => {
      const app = await buildApp(testEnv);
      const { rideId, participant } =
        await createFinishedRideWithParticipant(app);

      const create = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { rating: 4, comment: 'Хорошо.' },
      });
      expect(create.statusCode).toBe(201);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/reviews`,
      });

      expect(response.statusCode).toBe(200);
      const items = response.json().items;
      expect(items).toHaveLength(1);
      expect(items[0].rideId).toBe(rideId);
      expect(items[0].rating).toBe(4);
      expect(items[0].comment).toBe('Хорошо.');
      await app.close();
    });
  });

  describe('CR-043 Organizer rating summary', () => {
    it('defaults to null rating / zero count with no reviews', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken } = await createOrganizerRide(app);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/organizers/me',
        cookies: { session: organizerToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().rating).toBeNull();
      expect(response.json().reviewCount).toBe(0);
      await app.close();
    });

    it('aggregates reviews into the organizer’s own profile response', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId, participant } =
        await createFinishedRideWithParticipant(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { rating: 4 },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/organizers/me',
        cookies: { session: organizerToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().rating).toBe(4);
      expect(response.json().reviewCount).toBe(1);
      await app.close();
    });

    it('surfaces the organizer rating on GET /v1/rides (discovery), computed across all of their rides', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId, participant } =
        await createFinishedRideWithParticipant(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reviews`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { rating: 4 },
      });

      // A second, upcoming ride from the same organizer — the finished/reviewed
      // ride above never appears in `GET /v1/rides` (past `startsAt`), so this is
      // what proves the rating is an organizer-wide aggregate, not a per-ride one.
      const upcomingRide = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
        payload: {
          title: 'Следующий заезд',
          bicycleType: 'road',
          startsAt: '2099-05-01T05:00:00.000Z',
          startTimezone: 'Europe/Moscow',
        },
      });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${upcomingRide.json().ride.id}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides',
      });

      expect(response.statusCode).toBe(200);
      const item = response
        .json()
        .items.find(
          (i: { id: string }) => i.id === upcomingRide.json().ride.id,
        );
      expect(item).toBeDefined();
      expect(item.organizer.rating).toBe(4);
      expect(item.organizer.reviewCount).toBe(1);
      await app.close();
    });
  });
});
