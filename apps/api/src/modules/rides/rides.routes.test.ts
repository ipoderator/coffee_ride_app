import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { organizerProfiles, rides } from 'db/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';

// Same rationale as `organizers.routes.test.ts`: a real Postgres, `DELETE FROM users`
// (cascades to `organizer_profiles`; `rides.organizer_id` references
// `organizer_profiles` with `ON DELETE RESTRICT`, so this file's own `beforeEach`
// clears `rides` first, then `organizer_profiles`/`users` — see below).
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required to run apps/api tests (rides.routes.test.ts needs a real, migrated Postgres database).',
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

async function registerAndLogin(
  app: Awaited<ReturnType<typeof buildApp>>,
  options: { verifyEmail?: boolean; withOrganizerProfile?: boolean } = {},
) {
  const email = uniqueEmail();
  const register = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });

  if (options.verifyEmail ?? true) {
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
  }

  const login = await app.inject({
    method: 'POST',
    url: '/v1/auth/login',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  const userId: string = login.json().user.id;
  const rawToken = sessionCookie(login)!.value;

  if (options.withOrganizerProfile) {
    await app.inject({
      method: 'POST',
      url: '/v1/organizers/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: { name: 'Гравийный клуб' },
    });
  }

  return { email, userId, rawToken };
}

const VALID_PAYLOAD = {
  title: 'Утренний гравийный заезд',
  bicycleType: 'gravel',
  startsAt: '2027-05-01T05:00:00.000Z',
  startTimezone: 'Europe/Moscow',
};

describe('/v1/rides', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    // `rides.organizer_id -> organizer_profiles.id` is `ON DELETE RESTRICT`, so
    // `rides` must be cleared before `users`/`organizer_profiles` (the latter cascade
    // from `users`) — a plain `DELETE FROM users` alone would fail with a live `rides`
    // row referencing it.
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  describe('POST /v1/rides', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        payload: VALID_PAYLOAD,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('rejects creation when the caller has no organizer profile yet with 403', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: false,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('organizer_profile_required');

      await app.close();
    });

    it('creates a draft ride for an organizer and returns it', async () => {
      const app = await buildApp(testEnv);
      const { userId, rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.ride.title).toBe(VALID_PAYLOAD.title);
      expect(body.ride.bicycleType).toBe('gravel');
      expect(body.ride.startsAt).toBe('2027-05-01T05:00:00.000Z');
      expect(body.ride.startTimezone).toBe('Europe/Moscow');
      expect(body.ride.status).toBe('draft');
      expect(body.ride.updatedBy).toBe(userId);
      expect(body.ride.description).toBeNull();
      expect(body.ride.participantLimit).toBeNull();
      expect(body.ride.distanceKm).toBeNull();

      const [organizerProfile] = await app.db
        .select({ id: organizerProfiles.id })
        .from(organizerProfiles)
        .where(eq(organizerProfiles.userId, userId));
      expect(body.ride.organizerId).toBe(organizerProfile?.id);

      // Verified via a direct DB read, not just the HTTP response.
      const [row] = await app.db
        .select()
        .from(rides)
        .where(eq(rides.id, body.ride.id));
      expect(row?.title).toBe(VALID_PAYLOAD.title);
      expect(row?.status).toBe('draft');

      await app.close();
    });

    it('rejects an empty title with 400', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { ...VALID_PAYLOAD, title: '' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('rejects an invalid bicycleType with 400', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { ...VALID_PAYLOAD, bicycleType: 'unicycle' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('rejects a non-ISO startsAt with 400', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { ...VALID_PAYLOAD, startsAt: 'next Tuesday' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('rejects an unrecognized startTimezone with 400', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { ...VALID_PAYLOAD, startTimezone: 'Not/AZone' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('rejects a mismatched Origin with 403 (CSRF)', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: 'https://evil.example' },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');

      await app.close();
    });
  });
});
