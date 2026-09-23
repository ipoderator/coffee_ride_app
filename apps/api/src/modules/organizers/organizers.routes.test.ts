import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { organizerProfiles } from 'db/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// Same rationale as `users.routes.test.ts`/`auth.routes.test.ts`: a real Postgres,
// `DELETE FROM users` (cascades to `organizer_profiles`) to avoid the cross-file lock
// deadlock documented there.
const DATABASE_URL = getTestDatabaseUrl();

const WEB_ORIGIN = 'http://localhost:3000';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
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
  options: { verifyEmail?: boolean } = {},
) {
  const email = uniqueEmail();
  const register = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });

  if (options.verifyEmail) {
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
  return { email, userId, rawToken };
}

describe('/v1/organizers/me', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    // `rides.organizer_id` is `ON DELETE RESTRICT` — rides left behind by an
    // earlier test file (file order isn't fixed) would block the cascade from
    // `users` to `organizer_profiles`, so clear them first, same as every
    // rides-module suite does.
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  describe('POST /v1/organizers/me', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        payload: { name: 'Гравийный клуб' },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('rejects creation for an unverified email with 403', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, { verifyEmail: false });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Гравийный клуб' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('email_verification_required');

      await app.close();
    });

    it('creates an organizer profile for a verified user and returns it', async () => {
      const app = await buildApp(testEnv);
      const { userId, rawToken } = await registerAndLogin(app, {
        verifyEmail: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Гравийный клуб', description: 'Ездим по субботам.' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.organizerProfile.name).toBe('Гравийный клуб');
      expect(body.organizerProfile.description).toBe('Ездим по субботам.');
      expect(body.organizerProfile.userId).toBe(userId);

      // Verified via a direct DB read, not just the HTTP response.
      const [row] = await app.db
        .select()
        .from(organizerProfiles)
        .where(eq(organizerProfiles.userId, userId));
      expect(row?.name).toBe('Гравийный клуб');

      await app.close();
    });

    it('rejects a second create for the same user with 409', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, { verifyEmail: true });

      await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Гравийный клуб' },
      });

      const second = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Другое имя' },
      });

      expect(second.statusCode).toBe(409);
      expect(second.json().code).toBe('organizer_profile_already_exists');

      await app.close();
    });

    it('rejects an invalid payload with 400', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, { verifyEmail: true });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: '' },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('is subject to the CSRF Origin check like every other unsafe /v1 method', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, { verifyEmail: true });

      const response = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: 'http://evil.example' },
        cookies: { session: rawToken },
        payload: { name: 'Гравийный клуб' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');

      await app.close();
    });
  });

  describe('GET /v1/organizers/me', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/organizers/me',
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('returns 404 when no organizer profile exists yet', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, { verifyEmail: true });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/organizers/me',
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('organizer_profile_not_found');

      await app.close();
    });

    it('returns the current organizer profile when one exists', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, { verifyEmail: true });

      await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Гравийный клуб' },
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/organizers/me',
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().organizerProfile.name).toBe('Гравийный клуб');

      await app.close();
    });
  });

  describe('PATCH /v1/organizers/me', () => {
    it('returns 404 when no organizer profile exists yet', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, { verifyEmail: true });

      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Новое имя' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('organizer_profile_not_found');

      await app.close();
    });

    it('updates fields and leaves omitted fields unchanged; explicit null clears description', async () => {
      const app = await buildApp(testEnv);
      const { userId, rawToken } = await registerAndLogin(app, {
        verifyEmail: true,
      });

      await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Гравийный клуб', description: 'Ездим по субботам.' },
      });

      const renamed = await app.inject({
        method: 'PATCH',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Новое имя' },
      });
      expect(renamed.statusCode).toBe(200);
      expect(renamed.json().organizerProfile.name).toBe('Новое имя');
      // description omitted from this patch — must remain what it was.
      expect(renamed.json().organizerProfile.description).toBe(
        'Ездим по субботам.',
      );

      const cleared = await app.inject({
        method: 'PATCH',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { description: null },
      });
      expect(cleared.statusCode).toBe(200);
      expect(cleared.json().organizerProfile.description).toBeNull();
      // name untouched by this patch.
      expect(cleared.json().organizerProfile.name).toBe('Новое имя');

      const [row] = await app.db
        .select()
        .from(organizerProfiles)
        .where(eq(organizerProfiles.userId, userId));
      expect(row?.name).toBe('Новое имя');
      expect(row?.description).toBeNull();

      await app.close();
    });

    it('rejects an invalid payload with 400', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, { verifyEmail: true });

      await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'Гравийный клуб' },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: { name: 'x'.repeat(101) },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });
  });
});
