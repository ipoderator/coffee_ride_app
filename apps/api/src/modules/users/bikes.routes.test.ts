import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-126 ("garage"). Same setup shape as `users.routes.test.ts`.
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
  return { rawToken: sessionCookie(login)!.value };
}

async function createBike(
  app: Awaited<ReturnType<typeof buildApp>>,
  rawToken: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: 'POST',
    url: '/v1/users/me/bikes',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: rawToken },
    payload,
  });
}

describe('/v1/users/me/bikes', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  it('rejects every verb with no session cookie with 401', async () => {
    const app = await buildApp(testEnv);
    const list = await app.inject({ method: 'GET', url: '/v1/users/me/bikes' });
    expect(list.statusCode).toBe(401);
    const create = await app.inject({
      method: 'POST',
      url: '/v1/users/me/bikes',
      headers: { origin: WEB_ORIGIN },
      payload: { bikeType: 'road' },
    });
    expect(create.statusCode).toBe(401);
    await app.close();
  });

  it('creates a bike and lists it back', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);

    const created = await createBike(app, rawToken, {
      bikeType: 'gravel',
      brand: 'Canyon',
      model: 'Grail',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().bike).toMatchObject({
      bikeType: 'gravel',
      brand: 'Canyon',
      model: 'Grail',
      isActive: false,
    });

    const list = await app.inject({
      method: 'GET',
      url: '/v1/users/me/bikes',
      cookies: { session: rawToken },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().items).toHaveLength(1);
    await app.close();
  });

  it('rejects bikeType "any" — a ride requirement, not a real bike', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);
    const response = await createBike(app, rawToken, { bikeType: 'any' });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');
    await app.close();
  });

  it('exactly one active bike: creating a second active bike deactivates the first', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);

    const first = await createBike(app, rawToken, {
      bikeType: 'road',
      isActive: true,
    });
    const firstId = first.json().bike.id;

    const second = await createBike(app, rawToken, {
      bikeType: 'mtb',
      isActive: true,
    });
    expect(second.json().bike.isActive).toBe(true);

    const list = await app.inject({
      method: 'GET',
      url: '/v1/users/me/bikes',
      cookies: { session: rawToken },
    });
    const items: Array<{ id: string; isActive: boolean }> = list.json().items;
    expect(items.find((b) => b.id === firstId)?.isActive).toBe(false);
    expect(items.filter((b) => b.isActive)).toHaveLength(1);
    await app.close();
  });

  it('PATCH isActive:true deactivates whichever other bike was active', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);
    const first = await createBike(app, rawToken, {
      bikeType: 'road',
      isActive: true,
    });
    const second = await createBike(app, rawToken, { bikeType: 'gravel' });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/users/me/bikes/${second.json().bike.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: { isActive: true },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().bike.isActive).toBe(true);

    const list = await app.inject({
      method: 'GET',
      url: '/v1/users/me/bikes',
      cookies: { session: rawToken },
    });
    const items: Array<{ id: string; isActive: boolean }> = list.json().items;
    expect(items.find((b) => b.id === first.json().bike.id)?.isActive).toBe(
      false,
    );
    expect(items.filter((b) => b.isActive)).toHaveLength(1);
    await app.close();
  });

  it('404s updating/deleting another account’s bike (ownership, not just existence)', async () => {
    const app = await buildApp(testEnv);
    const owner = await registerAndLogin(app);
    const stranger = await registerAndLogin(app);
    const bike = await createBike(app, owner.rawToken, { bikeType: 'road' });

    const patch = await app.inject({
      method: 'PATCH',
      url: `/v1/users/me/bikes/${bike.json().bike.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: stranger.rawToken },
      payload: { brand: 'Hijacked' },
    });
    expect(patch.statusCode).toBe(404);
    expect(patch.json().code).toBe('bike_not_found');

    const del = await app.inject({
      method: 'DELETE',
      url: `/v1/users/me/bikes/${bike.json().bike.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: stranger.rawToken },
    });
    expect(del.statusCode).toBe(404);
    await app.close();
  });

  it('deletes a bike', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await registerAndLogin(app);
    const bike = await createBike(app, rawToken, { bikeType: 'road' });

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/users/me/bikes/${bike.json().bike.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
    });
    expect(response.statusCode).toBe(204);

    const list = await app.inject({
      method: 'GET',
      url: '/v1/users/me/bikes',
      cookies: { session: rawToken },
    });
    expect(list.json().items).toHaveLength(0);
    await app.close();
  });
});
