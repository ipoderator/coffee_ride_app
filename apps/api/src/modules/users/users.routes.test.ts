import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { users } from 'db/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// Same rationale as `auth.routes.test.ts`: a real Postgres, `DELETE FROM
// users` (not `TRUNCATE ... CASCADE`) to avoid the cross-file lock deadlock
// documented there.
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

async function registerAndLogin(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = uniqueEmail();
  await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });
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

describe('PATCH /v1/users/me', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    // Rides left by an earlier file would block the users cascade
    // (`rides.organizer_id` is `ON DELETE RESTRICT`) — see organizers.routes.test.ts.
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  it('rejects a request with no session cookie with 401', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      payload: { displayName: 'Rider' },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('updates the authenticated user’s own profile fields and returns them', async () => {
    const app = await buildApp(testEnv);
    const { userId, rawToken } = await registerAndLogin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: {
        displayName: 'Иван Иванов',
        phone: '+7 900 123-45-67',
        bio: 'Люблю гравийные заезды.',
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.displayName).toBe('Иван Иванов');
    expect(body.user.phone).toBe('+7 900 123-45-67');
    expect(body.user.bio).toBe('Люблю гравийные заезды.');
    expect(JSON.stringify(body)).not.toContain('passwordHash');

    // Verified via a direct DB read, not just the HTTP response.
    const [row] = await app.db.select().from(users).where(eq(users.id, userId));
    expect(row?.displayName).toBe('Иван Иванов');
    expect(row?.phone).toBe('+7 900 123-45-67');
    expect(row?.bio).toBe('Люблю гравийные заезды.');

    await app.close();
  });

  it('CR-126: updates profileVisibility and self-reported distance stats, defaulting to co_participants', async () => {
    const app = await buildApp(testEnv);
    const { userId, rawToken } = await registerAndLogin(app);

    const [before] = await app.db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    expect(before?.profileVisibility).toBe('co_participants');
    expect(before?.distanceWeekKm).toBeNull();

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: {
        profileVisibility: 'open',
        distanceWeekKm: 120,
        distanceMonthKm: 480,
        distanceYearKm: 5000,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.profileVisibility).toBe('open');
    expect(body.user.distanceWeekKm).toBe(120);
    expect(body.user.distanceMonthKm).toBe(480);
    expect(body.user.distanceYearKm).toBe(5000);

    await app.close();
  });

  it('CR-126: rejects a distance stat outside the sane bounds with a validation error', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: { distanceWeekKm: 999999 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');

    await app.close();
  });

  it('leaves omitted fields unchanged and clears a field set to null', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);

    const first = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: { displayName: 'Иван', phone: '+7 900 123-45-67' },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: { phone: null },
    });

    expect(second.statusCode).toBe(200);
    const body = second.json();
    // `displayName` was not sent this time — must remain what it was.
    expect(body.user.displayName).toBe('Иван');
    // `phone` was explicitly nulled.
    expect(body.user.phone).toBeNull();

    await app.close();
  });

  it('is a no-op returning the current user when the patch body is empty', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: {},
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.displayName).toBeNull();

    await app.close();
  });

  it('rejects an invalid payload with 400', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: { displayName: 'x'.repeat(81), phone: 'not-a-phone!!' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('validation_error');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);

    await app.close();
  });

  it('is subject to the CSRF Origin check like every other unsafe /v1 method', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);

    const response = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: 'http://evil.example' },
      cookies: { session: rawToken },
      payload: { displayName: 'Иван' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('csrf_origin_mismatch');

    await app.close();
  });
});
