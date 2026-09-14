import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { organizerProfiles, rides } from 'db/schema';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
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

  // CR-088/CR-016/CR-018 added tests whose *last-run* case (a CSRF-rejected `PATCH`)
  // creates a real ride via a preceding successful `POST` before the rejected
  // request — unlike this file's original last test, which never got past the CSRF
  // check at all. Without this, the row (and its `organizer_profiles`/`users` rows)
  // outlives the file: `rides.organizer_id` is `ON DELETE RESTRICT`, so the next
  // file's `DELETE FROM users` (no `rides` cleanup of its own — it has no reason to
  // know about this table) fails with a foreign-key violation. Cleaning up after this
  // file's own tests, not any other file's, is what actually fixes it — a suite
  // shouldn't depend on running last to avoid leaking state into whatever runs next.
  afterAll(async () => {
    const app = await buildApp(testEnv);
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

  describe('GET /v1/rides/mine', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides/mine',
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('returns an empty page for a caller with no organizer profile', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: false,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides/mine',
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ items: [], nextCursor: null });

      await app.close();
    });

    it("lists only the caller's own rides, newest-created first, and paginates", async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const other = await registerAndLogin(app, { withOrganizerProfile: true });

      // Someone else's ride must never appear in this caller's list.
      await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: other.rawToken },
        payload: { ...VALID_PAYLOAD, title: 'Чужой заезд' },
      });

      const first = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { ...VALID_PAYLOAD, title: 'Первый заезд' },
      });
      const second = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { ...VALID_PAYLOAD, title: 'Второй заезд' },
      });

      const page1 = await app.inject({
        method: 'GET',
        url: '/v1/rides/mine?limit=1',
        cookies: { session: rawToken },
      });
      expect(page1.statusCode).toBe(200);
      const body1 = page1.json();
      expect(body1.items).toHaveLength(1);
      expect(body1.items[0].id).toBe(second.json().ride.id);
      expect(body1.nextCursor).not.toBeNull();

      const page2 = await app.inject({
        method: 'GET',
        url: `/v1/rides/mine?limit=1&cursor=${encodeURIComponent(body1.nextCursor)}`,
        cookies: { session: rawToken },
      });
      expect(page2.statusCode).toBe(200);
      const body2 = page2.json();
      expect(body2.items).toHaveLength(1);
      expect(body2.items[0].id).toBe(first.json().ride.id);
      expect(body2.nextCursor).toBeNull();

      await app.close();
    });

    it('rejects a malformed cursor with 400 invalid_cursor', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides/mine?cursor=not-a-valid-cursor',
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('invalid_cursor');

      await app.close();
    });
  });

  describe('GET /v1/rides/:id', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${created.json().ride.id}`,
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('rejects a malformed id with 400 validation_error', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides/not-a-uuid',
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('returns 404 ride_not_found for a non-existent id', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides/00000000-0000-0000-0000-000000000000',
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it("returns 404 ride_not_found for another organizer's ride (not 403)", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const stranger = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${created.json().ride.id}`,
        cookies: { session: stranger.rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it("returns the caller's own ride", async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${created.json().ride.id}`,
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().ride.id).toBe(created.json().ride.id);

      await app.close();
    });
  });

  describe('PATCH /v1/rides/:id', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${created.json().ride.id}`,
        headers: { origin: WEB_ORIGIN },
        payload: { title: 'Новое название' },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it("returns 404 ride_not_found for another organizer's ride", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const stranger = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${created.json().ride.id}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.rawToken },
        payload: { title: 'Новое название' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it('rejects editing a non-draft ride with 409 ride_not_editable', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });
      // No publish endpoint exists yet (CR-019) — flip the status directly to
      // exercise the lifecycle gate.
      await app.db
        .update(rides)
        .set({ status: 'published' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${created.json().ride.id}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { title: 'Новое название' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_editable');

      await app.close();
    });

    it('rejects an invalid field with 400 validation_error', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${created.json().ride.id}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { participantLimit: -1 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('updates a draft ride and returns the updated fields', async () => {
      const app = await buildApp(testEnv);
      const { userId, rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${created.json().ride.id}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: {
          title: 'Обновлённое название',
          description: 'Подробности заезда',
          participantLimit: 30,
          priceRub: 500,
          distanceKm: 42.5,
          elevationGainMeters: 350,
          difficulty: 3,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ride.title).toBe('Обновлённое название');
      expect(body.ride.description).toBe('Подробности заезда');
      expect(body.ride.participantLimit).toBe(30);
      expect(body.ride.priceRub).toBe(500);
      expect(body.ride.distanceKm).toBe(42.5);
      expect(body.ride.elevationGainMeters).toBe(350);
      expect(body.ride.difficulty).toBe(3);
      expect(body.ride.updatedBy).toBe(userId);

      // Verified via a direct DB read, not just the HTTP response.
      const [row] = await app.db
        .select()
        .from(rides)
        .where(eq(rides.id, created.json().ride.id));
      expect(row?.title).toBe('Обновлённое название');
      expect(row?.participantLimit).toBe(30);

      await app.close();
    });

    it('rejects a mismatched Origin with 403 (CSRF)', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: VALID_PAYLOAD,
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${created.json().ride.id}`,
        headers: { origin: 'https://evil.example' },
        cookies: { session: rawToken },
        payload: { title: 'Новое название' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');

      await app.close();
    });
  });
});
