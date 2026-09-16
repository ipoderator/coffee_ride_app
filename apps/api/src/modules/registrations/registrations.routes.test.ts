import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';

// Same rationale as `stops.routes.test.ts`/`route-points.routes.test.ts`: a real
// Postgres, `DELETE FROM rides` before `DELETE FROM users`
// (`rides.organizer_id -> organizer_profiles.id` is `ON DELETE RESTRICT`).
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required to run apps/api tests (registrations.routes.test.ts needs a real, migrated Postgres database).',
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

/**
 * An organizer with a fresh `draft` ride — `openRegistration: true` (default)
 * additionally publishes it and opens registration, the state every "register" test
 * needs; some 404/409 cases want an earlier lifecycle state instead.
 */
async function createOrganizerRide(
  app: Awaited<ReturnType<typeof buildApp>>,
  options: {
    openRegistration?: boolean;
    participantLimit?: number;
    // CR-091 ("My registrations"): lets a test build a ride whose `startsAt` is
    // already in the past, needed for the `when=past` tab — every other caller of
    // this helper keeps the default far-future date. Applied via `PATCH` (still
    // `draft` at this point), same as `participantLimit` below.
    startsAt?: string;
    // CR-091: reuse an already-registered organizer's session for a second (or
    // third, ...) ride instead of registering a fresh user + organizer profile each
    // time — a test that needs several rides would otherwise burn through
    // `/v1/auth/register`'s 5-per-minute rate limit (`AUTH_RATE_LIMIT`) fast.
    organizerToken?: string;
  } = {},
) {
  let organizerToken = options.organizerToken;
  if (!organizerToken) {
    organizerToken = (await registerAndLoginUser(app)).rawToken;
    await app.inject({
      method: 'POST',
      url: '/v1/organizers/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: organizerToken },
      payload: { name: 'Гравийный клуб' },
    });
  }

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

  if (options.startsAt !== undefined) {
    await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: organizerToken },
      payload: { startsAt: options.startsAt, startTimezone: 'Europe/Moscow' },
    });
  }

  if (options.participantLimit !== undefined) {
    await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: organizerToken },
      payload: { participantLimit: options.participantLimit },
    });
  }

  if (options.openRegistration ?? true) {
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
  }

  return { organizerToken, rideId };
}

async function getRideDetail(
  app: Awaited<ReturnType<typeof buildApp>>,
  rideId: string,
  token?: string,
) {
  return app.inject({
    method: 'GET',
    url: `/v1/rides/${rideId}`,
    ...(token ? { cookies: { session: token } } : {}),
  });
}

describe('/v1/rides/:id/register', () => {
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

  describe('POST /v1/rides/:id/register', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/register`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a non-existent ride with 404 ride_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it("hides a non-owner's still-draft ride behind 404 ride_not_found", async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        openRegistration: false,
      });
      const { rawToken: participantToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('rejects a published-but-not-registration_open ride with 409 ride_registration_not_open', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app, {
        openRegistration: false,
      });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
      });
      const { rawToken: participantToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_registration_not_open');
      await app.close();
    });

    it('registers a participant and reflects it on GET /v1/rides/:id', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const { rawToken: participantToken, userId } =
        await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(201);
      const registration = response.json().registration;
      expect(registration.rideId).toBe(rideId);
      expect(registration.userId).toBe(userId);
      expect(registration.status).toBe('active');
      expect(registration.cancelledAt).toBeNull();

      const detail = await getRideDetail(app, rideId, participantToken);
      expect(detail.statusCode).toBe(200);
      expect(detail.json().registrationsCount).toBe(1);
      expect(detail.json().viewerRegistration.id).toBe(registration.id);

      // A different viewer (no session at all) sees the count but not the
      // registration itself.
      const anonymousDetail = await getRideDetail(app, rideId);
      expect(anonymousDetail.json().registrationsCount).toBe(1);
      expect(anonymousDetail.json().viewerRegistration).toBeNull();

      await app.close();
    });

    it('rejects a duplicate active registration with 409 registration_already_exists', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const { rawToken: participantToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('registration_already_exists');
      await app.close();
    });

    it('rejects registration past participantLimit with 409 ride_full', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        participantLimit: 1,
      });
      const { rawToken: firstToken } = await registerAndLoginUser(app);
      const { rawToken: secondToken } = await registerAndLoginUser(app);

      const first = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });
      expect(first.statusCode).toBe(201);

      const second = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });

      expect(second.statusCode).toBe(409);
      expect(second.json().code).toBe('ride_full');
      await app.close();
    });
  });

  describe('DELETE /v1/rides/:id/register', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${randomUUID()}/register`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects cancelling a registration that does not exist with 404 registration_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const { rawToken: participantToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('registration_not_found');
      await app.close();
    });

    it('cancels an active registration, frees capacity, and allows re-registering', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        participantLimit: 1,
      });
      const { rawToken: participantToken } = await registerAndLoginUser(app);
      const original = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      const cancelled = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });
      expect(cancelled.statusCode).toBe(204);

      const afterCancel = await getRideDetail(app, rideId, participantToken);
      expect(afterCancel.json().registrationsCount).toBe(0);
      expect(afterCancel.json().viewerRegistration).toBeNull();

      // A second participant can now take the freed spot.
      const { rawToken: otherToken } = await registerAndLoginUser(app);
      const otherRegistration = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: otherToken },
      });
      expect(otherRegistration.statusCode).toBe(201);

      // The original participant can re-register too, once the freed spot is
      // taken back by cancelling the other one — a fresh row, not the old one.
      await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: otherToken },
      });
      const reRegistered = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });
      expect(reRegistered.statusCode).toBe(201);
      expect(reRegistered.json().registration.id).not.toBe(
        original.json().registration.id,
      );

      await app.close();
    });
  });
});

describe('/v1/rides/:id/waitlist', () => {
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

  describe('POST /v1/rides/:id/waitlist', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/waitlist`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a non-existent ride with 404 ride_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it("hides a non-owner's still-draft ride behind 404 ride_not_found", async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        openRegistration: false,
      });
      const { rawToken: participantToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('rejects a published-but-not-registration_open ride with 409 ride_registration_not_open', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app, {
        openRegistration: false,
      });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
      });
      const { rawToken: participantToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_registration_not_open');
      await app.close();
    });

    it('rejects joining a ride that still has open spots with 409 ride_not_full', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        participantLimit: 2,
      });
      const { rawToken: participantToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_full');
      await app.close();
    });

    it('rejects joining a ride with no participantLimit with 409 ride_not_full', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const { rawToken: participantToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_full');
      await app.close();
    });

    it('rejects joining while already actively registered with 409 registration_already_exists', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        participantLimit: 1,
      });
      const { rawToken: participantToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('registration_already_exists');
      await app.close();
    });

    it('joins a full ride and reflects it on GET /v1/rides/:id', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        participantLimit: 1,
      });
      const { rawToken: firstToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });
      const { rawToken: secondToken, userId: secondUserId } =
        await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });

      expect(response.statusCode).toBe(201);
      const waitlistEntry = response.json().waitlistEntry;
      expect(waitlistEntry.rideId).toBe(rideId);
      expect(waitlistEntry.userId).toBe(secondUserId);
      expect(waitlistEntry.status).toBe('waiting');
      expect(waitlistEntry.promotedAt).toBeNull();

      const detail = await getRideDetail(app, rideId, secondToken);
      expect(detail.json().viewerWaitlistEntry.id).toBe(waitlistEntry.id);

      await app.close();
    });

    it('rejects a duplicate waiting entry with 409 waitlist_entry_already_exists', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        participantLimit: 1,
      });
      const { rawToken: firstToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });
      const { rawToken: secondToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('waitlist_entry_already_exists');
      await app.close();
    });
  });

  describe('DELETE /v1/rides/:id/waitlist', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${randomUUID()}/waitlist`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects leaving a waitlist the caller never joined with 404 waitlist_entry_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const { rawToken: participantToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participantToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('waitlist_entry_not_found');
      await app.close();
    });

    it('leaves the waitlist and allows rejoining', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        participantLimit: 1,
      });
      const { rawToken: firstToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });
      const { rawToken: secondToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });

      const left = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });
      expect(left.statusCode).toBe(204);

      const afterLeave = await getRideDetail(app, rideId, secondToken);
      expect(afterLeave.json().viewerWaitlistEntry).toBeNull();

      const rejoined = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });
      expect(rejoined.statusCode).toBe(201);

      await app.close();
    });
  });

  describe('auto-promotion on cancellation', () => {
    it('promotes the oldest waiting entry into an active registration when a spot frees up', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        participantLimit: 1,
      });
      const { rawToken: firstToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });

      // Two participants queue up, in order.
      const { rawToken: secondToken, userId: secondUserId } =
        await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });
      const { rawToken: thirdToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: thirdToken },
      });

      // The first participant cancels, freeing exactly one spot.
      const cancelled = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });
      expect(cancelled.statusCode).toBe(204);

      // The second (oldest waiting) participant was promoted, not the third.
      const secondDetail = await getRideDetail(app, rideId, secondToken);
      expect(secondDetail.json().viewerRegistration).not.toBeNull();
      expect(secondDetail.json().viewerRegistration.userId).toBe(secondUserId);
      expect(secondDetail.json().viewerWaitlistEntry).toBeNull();
      expect(secondDetail.json().registrationsCount).toBe(1);

      const thirdDetail = await getRideDetail(app, rideId, thirdToken);
      expect(thirdDetail.json().viewerRegistration).toBeNull();
      expect(thirdDetail.json().viewerWaitlistEntry).not.toBeNull();
      expect(thirdDetail.json().viewerWaitlistEntry.status).toBe('waiting');

      // The promoted waitlist entry itself is marked `promoted`, not deleted —
      // verified indirectly: a fresh waitlist join from the same (now-registered)
      // user must be rejected as already-registered, not treated as a fresh queue
      // entry, and joining is impossible anyway since the ride is full again.
      const rejoinAttempt = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });
      expect(rejoinAttempt.statusCode).toBe(409);
      expect(rejoinAttempt.json().code).toBe('registration_already_exists');

      await app.close();
    });

    it('does nothing when there is no one waiting', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app, {
        participantLimit: 1,
      });
      const { rawToken: firstToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });

      const cancelled = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });
      expect(cancelled.statusCode).toBe(204);

      const detail = await getRideDetail(app, rideId, firstToken);
      expect(detail.json().registrationsCount).toBe(0);

      await app.close();
    });
  });

  describe('GET /v1/rides/:id/participants', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${randomUUID()}/participants`,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("rejects a non-owner's request with 404 ride_not_found", async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const { rawToken: strangerToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/participants`,
        cookies: { session: strangerToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('returns 404 ride_not_found for a non-existent ride', async () => {
      const app = await buildApp(testEnv);
      const { rawToken: someToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${randomUUID()}/participants`,
        cookies: { session: someToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('the owner sees an empty list for a fresh draft ride', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app, {
        openRegistration: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/participants`,
        cookies: { session: organizerToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ items: [], nextCursor: null });
      await app.close();
    });

    it('lists only active registrations, oldest first, excluding a cancelled one', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app);

      const { rawToken: firstToken, userId: firstUserId } =
        await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });
      // See the pagination test below for why this gap matters — the cursor's
      // tiebreaker is `id`, not insertion order.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const { rawToken: secondToken, userId: secondUserId } =
        await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });
      // Registers then cancels — must not appear in the participant list.
      const { rawToken: cancelledToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: cancelledToken },
      });
      await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: cancelledToken },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/participants`,
        cookies: { session: organizerToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toHaveLength(2);
      expect(body.items.map((item: { userId: string }) => item.userId)).toEqual(
        [firstUserId, secondUserId],
      );
      expect(body.items[0].displayName).toBeNull();
      expect(body.nextCursor).toBeNull();
      await app.close();
    });

    it('paginates and rejects a malformed cursor with 400 invalid_cursor', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app);

      const { rawToken: firstToken, userId: firstUserId } =
        await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstToken },
      });
      // The cursor's tiebreaker is `id`, not insertion order — a genuine tie on
      // `createdAt` (two inserts landing in the same microsecond, easy for two
      // back-to-back in-process `.inject()` calls) would make this test's ordering
      // assumption flaky, so force a visible gap between the two registrations.
      await new Promise((resolve) => setTimeout(resolve, 5));
      const { rawToken: secondToken, userId: secondUserId } =
        await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondToken },
      });

      const page1 = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/participants?limit=1`,
        cookies: { session: organizerToken },
      });
      expect(page1.statusCode).toBe(200);
      const body1 = page1.json();
      expect(body1.items).toHaveLength(1);
      expect(body1.items[0].userId).toBe(firstUserId);
      expect(body1.nextCursor).not.toBeNull();

      const page2 = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/participants?limit=1&cursor=${encodeURIComponent(body1.nextCursor)}`,
        cookies: { session: organizerToken },
      });
      expect(page2.statusCode).toBe(200);
      const body2 = page2.json();
      expect(body2.items).toHaveLength(1);
      expect(body2.items[0].userId).toBe(secondUserId);
      expect(body2.nextCursor).toBeNull();

      const malformed = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/participants?cursor=not-a-valid-cursor`,
        cookies: { session: organizerToken },
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json().code).toBe('invalid_cursor');
      await app.close();
    });
  });

  describe('GET /v1/rides/:id/waitlist (organizer view)', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${randomUUID()}/waitlist`,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("rejects a non-owner's request with 404 ride_not_found", async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const { rawToken: strangerToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/waitlist`,
        cookies: { session: strangerToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('lists only waiting entries, FIFO order, excluding a promoted one', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app, {
        participantLimit: 1,
      });

      const { rawToken: registeredToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: registeredToken },
      });

      // First queued, promoted once the registered participant cancels below —
      // must not appear in the organizer's waitlist view afterwards.
      const { rawToken: promotedToken } = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: promotedToken },
      });
      const { rawToken: waitingToken, userId: waitingUserId } =
        await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: waitingToken },
      });

      await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: registeredToken },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/waitlist`,
        cookies: { session: organizerToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.items).toHaveLength(1);
      expect(body.items[0].userId).toBe(waitingUserId);
      expect(body.nextCursor).toBeNull();
      await app.close();
    });
  });
});

describe('GET /v1/registrations/mine', () => {
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

    const response = await app.inject({
      method: 'GET',
      url: '/v1/registrations/mine?when=upcoming',
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('rejects a missing/invalid when with 400', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLoginUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/registrations/mine',
      cookies: { session: rawToken },
    });

    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('returns an empty list when the caller has no active registrations', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLoginUser(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/registrations/mine?when=upcoming',
      cookies: { session: rawToken },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], nextCursor: null });
    await app.close();
  });

  it("splits an upcoming and a past registration into the correct tab, excludes a cancelled one and another user's registration", async () => {
    const app = await buildApp(testEnv);
    const { rawToken, userId } = await registerAndLoginUser(app);

    // One shared organizer for all four rides — keeps this test's total
    // `/v1/auth/register` calls under `AUTH_RATE_LIMIT`'s 5-per-minute cap.
    const { organizerToken, rideId: upcomingRideId } =
      await createOrganizerRide(app);
    const { rideId: pastRideId } = await createOrganizerRide(app, {
      organizerToken,
      startsAt: '2020-01-01T05:00:00.000Z',
    });
    // A third ride the caller registers for then cancels — must appear in neither tab.
    const { rideId: cancelledRideId } = await createOrganizerRide(app, {
      organizerToken,
    });
    // A fourth ride another user registers for — must never leak into this caller's list.
    const { rideId: otherUsersRideId } = await createOrganizerRide(app, {
      organizerToken,
    });
    const { rawToken: otherToken } = await registerAndLoginUser(app);
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${otherUsersRideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: otherToken },
    });

    await app.inject({
      method: 'POST',
      url: `/v1/rides/${upcomingRideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
    });
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${pastRideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
    });
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${cancelledRideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
    });
    await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${cancelledRideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
    });

    const upcoming = await app.inject({
      method: 'GET',
      url: '/v1/registrations/mine?when=upcoming',
      cookies: { session: rawToken },
    });
    expect(upcoming.statusCode).toBe(200);
    const upcomingBody = upcoming.json();
    expect(upcomingBody.items).toHaveLength(1);
    expect(upcomingBody.items[0].ride.id).toBe(upcomingRideId);
    expect(upcomingBody.items[0].registration.userId).toBe(userId);
    expect(upcomingBody.items[0].ride.organizer.name).toBe('Гравийный клуб');
    expect(upcomingBody.nextCursor).toBeNull();

    const past = await app.inject({
      method: 'GET',
      url: '/v1/registrations/mine?when=past',
      cookies: { session: rawToken },
    });
    expect(past.statusCode).toBe(200);
    const pastBody = past.json();
    expect(pastBody.items).toHaveLength(1);
    expect(pastBody.items[0].ride.id).toBe(pastRideId);
    expect(pastBody.nextCursor).toBeNull();

    await app.close();
  });

  it('paginates the upcoming tab soonest-first and rejects a malformed cursor with 400 invalid_cursor', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLoginUser(app);

    const { rideId: soonerRideId } = await createOrganizerRide(app, {
      startsAt: '2027-03-01T05:00:00.000Z',
    });
    const { rideId: laterRideId } = await createOrganizerRide(app, {
      startsAt: '2027-08-01T05:00:00.000Z',
    });
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${laterRideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
    });
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${soonerRideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
    });

    const page1 = await app.inject({
      method: 'GET',
      url: '/v1/registrations/mine?when=upcoming&limit=1',
      cookies: { session: rawToken },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json();
    expect(body1.items).toHaveLength(1);
    expect(body1.items[0].ride.id).toBe(soonerRideId);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await app.inject({
      method: 'GET',
      url: `/v1/registrations/mine?when=upcoming&limit=1&cursor=${encodeURIComponent(body1.nextCursor)}`,
      cookies: { session: rawToken },
    });
    expect(page2.statusCode).toBe(200);
    const body2 = page2.json();
    expect(body2.items).toHaveLength(1);
    expect(body2.items[0].ride.id).toBe(laterRideId);
    expect(body2.nextCursor).toBeNull();

    const malformed = await app.inject({
      method: 'GET',
      url: '/v1/registrations/mine?when=upcoming&cursor=not-a-valid-cursor',
      cookies: { session: rawToken },
    });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json().code).toBe('invalid_cursor');
    await app.close();
  });
});
