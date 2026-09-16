import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';

// Same rationale as `registrations.routes.test.ts`: a real Postgres,
// `DELETE FROM rides` before `DELETE FROM users` (`rides.organizer_id ->
// organizer_profiles.id` is `ON DELETE RESTRICT`). `ride_updates`/`notifications`
// both cascade from `rides`/`users`, so no extra cleanup statement is needed.
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required to run apps/api tests (notifications.routes.test.ts needs a real, migrated Postgres database).',
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

/** An organizer with a published, registration-open ride — same default every
 * "register"/"update"/"cancel" test needs. */
async function createOrganizerRide(
  app: Awaited<ReturnType<typeof buildApp>>,
  options: { openRegistration?: boolean } = {},
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

describe('Communication (CR-038/039/040/041)', () => {
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

  describe('POST /v1/rides/:id/updates', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/updates`,
        headers: { origin: WEB_ORIGIN },
        payload: { message: 'Старт перенесён на 9:00.' },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a non-existent ride with 404 ride_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/updates`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { message: 'Старт перенесён на 9:00.' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it("rejects a non-owner organizer's ride with 404 ride_not_found", async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const { rawToken: strangerToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/updates`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: strangerToken },
        payload: { message: 'Старт перенесён на 9:00.' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('rejects an empty message with 400 validation_error', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/updates`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
        payload: { message: '' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');
      await app.close();
    });

    it('creates a RideUpdate and fans out a ride_update notification to active registrants', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app);
      const participant = await registerParticipant(app, rideId);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/updates`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
        payload: { message: 'Старт перенесён на 9:00.' },
      });

      expect(response.statusCode).toBe(201);
      const rideUpdate = response.json().rideUpdate;
      expect(rideUpdate.rideId).toBe(rideId);
      expect(rideUpdate.message).toBe('Старт перенесён на 9:00.');

      const inbox = await app.inject({
        method: 'GET',
        url: '/v1/notifications/mine',
        cookies: { session: participant.rawToken },
      });
      expect(inbox.statusCode).toBe(200);
      const items = inbox.json().items;
      const updateNotification = items.find(
        (item: { type: string }) => item.type === 'ride_update',
      );
      expect(updateNotification).toBeDefined();
      expect(updateNotification.ride.id).toBe(rideId);
      expect(updateNotification.message).toBe('Старт перенесён на 9:00.');
      expect(updateNotification.readAt).toBeNull();
      await app.close();
    });

    it('succeeds with no active registrants (no notifications to fan out)', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/updates`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
        payload: { message: 'Погода испортилась.' },
      });

      expect(response.statusCode).toBe(201);
      await app.close();
    });
  });

  describe('GET /v1/rides/:id/updates', () => {
    it('rejects a non-owner organizer with 404 ride_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const { rawToken: strangerToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/updates`,
        cookies: { session: strangerToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('lists an organizer’s own ride updates, newest first', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app);

      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/updates`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
        payload: { message: 'Первое сообщение.' },
      });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/updates`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
        payload: { message: 'Второе сообщение.' },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/updates`,
        cookies: { session: organizerToken },
      });

      expect(response.statusCode).toBe(200);
      const items = response.json().items;
      expect(items).toHaveLength(2);
      expect(items[0].message).toBe('Второе сообщение.');
      expect(items[1].message).toBe('Первое сообщение.');
      await app.close();
    });
  });

  describe('GET /v1/notifications/mine', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/notifications/mine',
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('creates a registration_confirmed notification on register, visible only to that user', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const participantA = await registerParticipant(app, rideId);
      const { rawToken: participantBToken } = await registerAndLoginUser(app);

      const inboxA = await app.inject({
        method: 'GET',
        url: '/v1/notifications/mine',
        cookies: { session: participantA.rawToken },
      });
      expect(inboxA.statusCode).toBe(200);
      const itemsA = inboxA.json().items;
      expect(itemsA).toHaveLength(1);
      expect(itemsA[0].type).toBe('registration_confirmed');
      expect(itemsA[0].ride.id).toBe(rideId);
      expect(itemsA[0].message).toBeNull();

      const inboxB = await app.inject({
        method: 'GET',
        url: '/v1/notifications/mine',
        cookies: { session: participantBToken },
      });
      expect(inboxB.statusCode).toBe(200);
      expect(inboxB.json().items).toHaveLength(0);
      await app.close();
    });

    it('notifies the promoted user, not the cancelling one, on waitlist auto-promotion', async () => {
      const app = await buildApp(testEnv);
      // `PATCH` (setting `participantLimit`) is draft-only, so it must run
      // before `publish`/`open-registration` — unlike every other test in this
      // file, which doesn't care about capacity and can use the default
      // already-open ride.
      const { organizerToken, rideId } = await createOrganizerRide(app, {
        openRegistration: false,
      });
      await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
        payload: { participantLimit: 1 },
      });
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

      const firstParticipant = await registerParticipant(app, rideId);
      const secondParticipant = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: secondParticipant.rawToken },
      });

      await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: firstParticipant.rawToken },
      });

      const promotedInbox = await app.inject({
        method: 'GET',
        url: '/v1/notifications/mine',
        cookies: { session: secondParticipant.rawToken },
      });
      expect(promotedInbox.statusCode).toBe(200);
      expect(
        promotedInbox
          .json()
          .items.some(
            (item: { type: string }) => item.type === 'registration_confirmed',
          ),
      ).toBe(true);
      await app.close();
    });

    it('fans out a ride_cancelled notification to active registrants when the organizer cancels the ride', async () => {
      const app = await buildApp(testEnv);
      const { organizerToken, rideId } = await createOrganizerRide(app);
      const participant = await registerParticipant(app, rideId);

      const cancel = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cancel`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: organizerToken },
      });
      expect(cancel.statusCode).toBe(200);

      const inbox = await app.inject({
        method: 'GET',
        url: '/v1/notifications/mine',
        cookies: { session: participant.rawToken },
      });
      expect(inbox.statusCode).toBe(200);
      const cancelledNotification = inbox
        .json()
        .items.find((item: { type: string }) => item.type === 'ride_cancelled');
      expect(cancelledNotification).toBeDefined();
      expect(cancelledNotification.ride.id).toBe(rideId);
      await app.close();
    });
  });

  describe('POST /v1/notifications/:id/read', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/notifications/${randomUUID()}/read`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a non-existent notification with 404 notification_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLoginUser(app);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/notifications/${randomUUID()}/read`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('notification_not_found');
      await app.close();
    });

    it("rejects another user's notification with 404 notification_not_found", async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const participant = await registerParticipant(app, rideId);
      const { rawToken: strangerToken } = await registerAndLoginUser(app);

      const inbox = await app.inject({
        method: 'GET',
        url: '/v1/notifications/mine',
        cookies: { session: participant.rawToken },
      });
      const notificationId = inbox.json().items[0].id;

      const response = await app.inject({
        method: 'POST',
        url: `/v1/notifications/${notificationId}/read`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: strangerToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('notification_not_found');
      await app.close();
    });

    it('marks a notification read, idempotently', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOrganizerRide(app);
      const participant = await registerParticipant(app, rideId);

      const inbox = await app.inject({
        method: 'GET',
        url: '/v1/notifications/mine',
        cookies: { session: participant.rawToken },
      });
      const notificationId = inbox.json().items[0].id;
      expect(inbox.json().items[0].readAt).toBeNull();

      const firstRead = await app.inject({
        method: 'POST',
        url: `/v1/notifications/${notificationId}/read`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
      });
      expect(firstRead.statusCode).toBe(200);
      const firstReadAt = firstRead.json().notification.readAt;
      expect(firstReadAt).not.toBeNull();

      const secondRead = await app.inject({
        method: 'POST',
        url: `/v1/notifications/${notificationId}/read`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
      });
      expect(secondRead.statusCode).toBe(200);
      expect(secondRead.json().notification.readAt).toBe(firstReadAt);
      await app.close();
    });
  });
});
