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
  } = {},
) {
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
