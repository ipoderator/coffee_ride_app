import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-165: the optional per-ride organizer contact. Real Postgres, same setup as
// `participants-visibility.routes.test.ts`.
//
// The point of this suite is the *visibility* rule — the contact is private
// (`.claude/rules/security.md`), so "who gets the field at all" matters more than
// any single happy path.
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

async function createOpenRide(app: App, contact?: unknown) {
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
      ...(contact === undefined ? {} : { contact }),
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
  return { organizerToken, rideId, createStatus: ride.statusCode };
}

function getRide(app: App, rideId: string, token: string | null) {
  return app.inject({
    method: 'GET',
    url: `/v1/rides/${rideId}`,
    ...(token ? { cookies: { session: token } } : {}),
  });
}

function setContact(
  app: App,
  rideId: string,
  token: string | null,
  payload: unknown,
) {
  return app.inject({
    method: 'PUT',
    url: `/v1/rides/${rideId}/contact`,
    headers: { origin: WEB_ORIGIN },
    ...(token ? { cookies: { session: token } } : {}),
    payload: payload as Record<string, unknown>,
  });
}

async function clean() {
  const app = await buildApp(testEnv);
  await app.db.execute(sql`DELETE FROM rides`);
  await app.db.execute(sql`DELETE FROM users`);
  await app.close();
}

describe('ride organizer contact (CR-165)', () => {
  beforeEach(clean);
  afterAll(clean);

  describe('visibility', () => {
    it('hides the contact from an anonymous viewer', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOpenRide(app, {
        type: 'telegram',
        value: '@coffee_ride',
      });

      const response = await getRide(app, rideId, null);

      expect(response.statusCode).toBe(200);
      // Absent entirely, not `null` — the payload must not even reveal that a
      // contact exists.
      expect(response.json()).not.toHaveProperty('contact');
      await app.close();
    });

    it('hides the contact from a signed-in user who has not registered', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOpenRide(app, {
        type: 'telegram',
        value: '@coffee_ride',
      });
      const stranger = await registerAndLoginUser(app);

      const response = await getRide(app, rideId, stranger);

      expect(response.statusCode).toBe(200);
      expect(response.json()).not.toHaveProperty('contact');
      await app.close();
    });

    it('shows the contact to a participant with an active registration', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOpenRide(app, {
        type: 'telegram',
        value: '@coffee_ride',
      });
      const rider = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rider },
      });

      const response = await getRide(app, rideId, rider);

      expect(response.json().contact).toEqual({
        type: 'telegram',
        value: 'coffee_ride',
      });
      await app.close();
    });

    it('hides the contact again once the participant cancels', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOpenRide(app, {
        type: 'phone',
        value: '+7 916 123-45-67',
      });
      const rider = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rider },
      });
      await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rider },
      });

      const response = await getRide(app, rideId, rider);

      expect(response.json()).not.toHaveProperty('contact');
      await app.close();
    });

    it('shows the contact to the organizer who owns the ride', async () => {
      const app = await buildApp(testEnv);
      const { rideId, organizerToken } = await createOpenRide(app, {
        type: 'email',
        value: 'Ride@Example.COM',
      });

      const response = await getRide(app, rideId, organizerToken);

      expect(response.json().contact).toEqual({
        type: 'email',
        value: 'ride@example.com',
      });
      await app.close();
    });

    it('never includes the contact in the public ride list', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOpenRide(app, {
        type: 'telegram',
        value: '@coffee_ride',
      });
      const rider = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rider },
      });

      // Even for the registered rider, who may see it on the detail page.
      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides',
        cookies: { session: rider },
      });

      const item = response
        .json()
        .items.find((row: { id: string }) => row.id === rideId);
      expect(item).toBeDefined();
      expect(item).not.toHaveProperty('contact');
      await app.close();
    });

    it('omits the contact when the organizer gave none', async () => {
      const app = await buildApp(testEnv);
      const { rideId, organizerToken } = await createOpenRide(app);

      const response = await getRide(app, rideId, organizerToken);

      expect(response.statusCode).toBe(200);
      expect(response.json()).not.toHaveProperty('contact');
      await app.close();
    });
  });

  describe('validation and normalization', () => {
    it.each([
      ['phone', '8 (916) 123-45-67', '+79161234567'],
      ['phone', '+7 916 123 45 67', '+79161234567'],
      ['max', '79161234567', '+79161234567'],
      ['telegram', '@coffee_ride', 'coffee_ride'],
      ['telegram', 'https://t.me/coffee_ride', 'coffee_ride'],
      ['email', '  Ride@Example.COM  ', 'ride@example.com'],
    ])('normalizes %s %j to %j', async (type, raw, expected) => {
      const app = await buildApp(testEnv);
      const { rideId, organizerToken } = await createOpenRide(app, {
        type,
        value: raw,
      });

      const response = await getRide(app, rideId, organizerToken);

      expect(response.json().contact).toEqual({ type, value: expected });
      await app.close();
    });

    it.each([
      ['phone', '12345'],
      ['telegram', '@a'],
      ['telegram', '@has spaces'],
      ['email', 'not-an-email'],
    ])('rejects an invalid %s (%j) with 400', async (type, raw) => {
      const app = await buildApp(testEnv);
      const { rideId, organizerToken } = await createOpenRide(app);

      const response = await setContact(app, rideId, organizerToken, {
        contact: { type, value: raw },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });

    it('rejects an unknown contact type with 400', async () => {
      const app = await buildApp(testEnv);
      const { rideId, organizerToken } = await createOpenRide(app);

      const response = await setContact(app, rideId, organizerToken, {
        contact: { type: 'whatsapp', value: '+79161234567' },
      });

      expect(response.statusCode).toBe(400);
      await app.close();
    });
  });

  describe('PUT /v1/rides/:id/contact', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const response = await setContact(app, randomUUID(), null, {
        contact: { type: 'telegram', value: '@coffee_ride' },
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it("answers 404 ride_not_found for someone else's ride", async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOpenRide(app);
      const stranger = await registerAndLoginUser(app);

      const response = await setContact(app, rideId, stranger, {
        contact: { type: 'telegram', value: '@coffee_ride' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('updates the contact of an already-published ride', async () => {
      // The whole reason this endpoint exists instead of folding into the
      // draft-only PATCH: a stale contact must stay fixable after publication.
      const app = await buildApp(testEnv);
      const { rideId, organizerToken } = await createOpenRide(app, {
        type: 'telegram',
        value: '@old_handle',
      });

      const response = await setContact(app, rideId, organizerToken, {
        contact: { type: 'phone', value: '+7 916 765-43-21' },
      });

      expect(response.statusCode).toBe(200);
      const detail = await getRide(app, rideId, organizerToken);
      expect(detail.json().contact).toEqual({
        type: 'phone',
        value: '+79167654321',
      });
      await app.close();
    });

    it('clears the contact when sent null', async () => {
      const app = await buildApp(testEnv);
      const { rideId, organizerToken } = await createOpenRide(app, {
        type: 'telegram',
        value: '@coffee_ride',
      });

      const response = await setContact(app, rideId, organizerToken, {
        contact: null,
      });

      expect(response.statusCode).toBe(200);
      const detail = await getRide(app, rideId, organizerToken);
      expect(detail.json()).not.toHaveProperty('contact');
      await app.close();
    });
  });
});
