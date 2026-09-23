import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { routes } from 'db/schema';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-117 ("Pace groups") organizer CRUD + CR-116 (discovery card fields). Same
// real-Postgres rationale as `stops.routes.test.ts`: `DELETE FROM rides` before
// `DELETE FROM users` (`rides.organizer_id` is `ON DELETE RESTRICT`) — which also
// proves a ride with groups *and* group-bound registrations still deletes cleanly
// (the composite FKs are `no action`, checked after the cascades).
const DATABASE_URL = getTestDatabaseUrl();

const WEB_ORIGIN = 'http://localhost:3000';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
  WEB_ORIGIN,
});

type App = Awaited<ReturnType<typeof buildApp>>;

const PASSWORD = 'a-strong-password-123';

async function registerAndLoginUser(app: App) {
  const email = `${randomUUID()}@example.test`;
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
  return login.cookies.find((c) => c.name === 'session')!.value;
}

/** An organizer with a fresh `draft` ride. */
async function createOrganizerRide(app: App) {
  const token = await registerAndLoginUser(app);
  await app.inject({
    method: 'POST',
    url: '/v1/organizers/me',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: token },
    payload: { name: 'Гравийный клуб' },
  });
  const ride = await app.inject({
    method: 'POST',
    url: '/v1/rides',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: token },
    payload: {
      title: 'Маршрут выходного дня',
      bicycleType: 'road',
      startsAt: '2027-05-01T05:00:00.000Z',
      startTimezone: 'Europe/Moscow',
    },
  });
  return { token, rideId: ride.json().ride.id as string };
}

async function transition(
  app: App,
  token: string,
  rideId: string,
  action: string,
) {
  const response = await app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/${action}`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: token },
  });
  expect(response.statusCode).toBe(200);
}

async function createGroup(
  app: App,
  token: string,
  rideId: string,
  payload: Record<string, unknown>,
) {
  return app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/groups`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: token },
    payload,
  });
}

async function listGroups(app: App, token: string, rideId: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/v1/rides/${rideId}/groups`,
    cookies: { session: token },
  });
  expect(response.statusCode).toBe(200);
  return response.json().items as Array<{
    id: string;
    name: string;
    position: number;
    registrationsCount: number;
  }>;
}

describe('/v1/rides/:id/groups (CR-117)', () => {
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
    const rideId = randomUUID();
    const post = await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/groups`,
      headers: { origin: WEB_ORIGIN },
      payload: { name: 'Группа 1', paceKmh: 25 },
    });
    const get = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/groups`,
    });
    expect(post.statusCode).toBe(401);
    expect(get.statusCode).toBe(401);
    await app.close();
  });

  it("hides another organizer's ride behind 404 ride_not_found on every verb", async () => {
    const app = await buildApp(testEnv);
    const owner = await createOrganizerRide(app);
    const stranger = await createOrganizerRide(app);
    const created = await createGroup(app, owner.token, owner.rideId, {
      name: 'Группа 1',
      paceKmh: 25,
    });
    const groupId = created.json().group.id as string;

    const responses = await Promise.all([
      app.inject({
        method: 'GET',
        url: `/v1/rides/${owner.rideId}/groups`,
        cookies: { session: stranger.token },
      }),
      createGroup(app, stranger.token, owner.rideId, {
        name: 'Чужая',
        paceKmh: 30,
      }),
      app.inject({
        method: 'PATCH',
        url: `/v1/rides/${owner.rideId}/groups/${groupId}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.token },
        payload: { name: 'Взлом' },
      }),
      app.inject({
        method: 'DELETE',
        url: `/v1/rides/${owner.rideId}/groups/${groupId}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.token },
      }),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
    }
    expect(await listGroups(app, owner.token, owner.rideId)).toHaveLength(1);
    await app.close();
  });

  it('rejects invalid payloads with 400 validation_error', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    for (const payload of [
      { name: '', paceKmh: 25 },
      { name: '   ', paceKmh: 25 },
      { name: 'x'.repeat(61), paceKmh: 25 },
      { name: 'Группа', paceKmh: 4.9 },
      { name: 'Группа', paceKmh: 60.1 },
      { name: 'Группа' },
      { name: 'Группа', paceKmh: 25, description: 'x'.repeat(501) },
    ]) {
      const response = await createGroup(app, token, rideId, payload);
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');
    }
    await app.close();
  });

  it('creates groups at increasing positions, trimmed, and lists them in order with counts', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);

    const first = await createGroup(app, token, rideId, {
      name: '  Группа 1  ',
      paceKmh: 25,
      description: 'Спокойный темп',
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().group).toMatchObject({
      rideId,
      name: 'Группа 1',
      paceKmh: 25,
      description: 'Спокойный темп',
      position: 0,
    });
    const second = await createGroup(app, token, rideId, {
      name: 'Группа 2',
      paceKmh: 32.5,
    });
    expect(second.json().group).toMatchObject({
      position: 1,
      paceKmh: 32.5,
      description: null,
    });

    const items = await listGroups(app, token, rideId);
    expect(
      items.map((g) => [g.name, g.position, g.registrationsCount]),
    ).toEqual([
      ['Группа 1', 0, 0],
      ['Группа 2', 1, 0],
    ]);

    const page = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/groups?limit=1`,
      cookies: { session: token },
    });
    expect(page.json().items).toHaveLength(1);
    const next = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/groups?limit=1&cursor=${page.json().nextCursor}`,
      cookies: { session: token },
    });
    expect(next.json().items[0].name).toBe('Группа 2');
    expect(next.json().nextCursor).toBeNull();
    await app.close();
  });

  it('rejects a case-insensitive duplicate name with 409 group_name_taken', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    await createGroup(app, token, rideId, { name: 'Быстрые', paceKmh: 35 });
    const duplicate = await createGroup(app, token, rideId, {
      name: 'БЫСТРЫЕ',
      paceKmh: 36,
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().code).toBe('group_name_taken');

    const other = await createGroup(app, token, rideId, {
      name: 'Медленные',
      paceKmh: 22,
    });
    const rename = await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}/groups/${other.json().group.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: { name: 'быстрые' },
    });
    expect(rename.statusCode).toBe(409);
    expect(rename.json().code).toBe('group_name_taken');
    await app.close();
  });

  it('caps a ride at 6 groups with 409 group_limit_reached', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    for (let i = 1; i <= 6; i++) {
      const response = await createGroup(app, token, rideId, {
        name: `Группа ${i}`,
        paceKmh: 20 + i,
      });
      expect(response.statusCode).toBe(201);
    }
    const seventh = await createGroup(app, token, rideId, {
      name: 'Группа 7',
      paceKmh: 40,
    });
    expect(seventh.statusCode).toBe(409);
    expect(seventh.json().code).toBe('group_limit_reached');
    await app.close();
  });

  it('edits fields and reorders via position, keeping positions dense', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    const ids: string[] = [];
    for (const [name, paceKmh] of [
      ['A', 25],
      ['B', 30],
      ['C', 35],
    ] as const) {
      ids.push(
        (await createGroup(app, token, rideId, { name, paceKmh })).json().group
          .id,
      );
    }

    const moved = await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}/groups/${ids[2]}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: { position: 0, paceKmh: 36, description: 'Быстро' },
    });
    expect(moved.statusCode).toBe(200);
    expect(moved.json().group).toMatchObject({
      name: 'C',
      position: 0,
      paceKmh: 36,
      description: 'Быстро',
    });
    expect(
      (await listGroups(app, token, rideId)).map((g) => [g.name, g.position]),
    ).toEqual([
      ['C', 0],
      ['A', 1],
      ['B', 2],
    ]);

    // A position past the end is clamped to the last slot.
    const toEnd = await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}/groups/${ids[2]}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: { position: 5 },
    });
    expect(toEnd.json().group.position).toBe(2);
    expect((await listGroups(app, token, rideId)).map((g) => g.name)).toEqual([
      'A',
      'B',
      'C',
    ]);

    const unknown = await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}/groups/${randomUUID()}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: { name: 'X' },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().code).toBe('group_not_found');
    await app.close();
  });

  it("rejects a group id that belongs to another of the organizer's rides with 404 group_not_found", async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    const otherRide = await app.inject({
      method: 'POST',
      url: '/v1/rides',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: {
        title: 'Второй заезд',
        bicycleType: 'road',
        startsAt: '2027-06-01T05:00:00.000Z',
        startTimezone: 'Europe/Moscow',
      },
    });
    const foreign = await createGroup(app, token, otherRide.json().ride.id, {
      name: 'Чужая',
      paceKmh: 30,
    });
    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${rideId}/groups/${foreign.json().group.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('group_not_found');
    await app.close();
  });

  it('deletes a group with 204 and renumbers the rest', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    const a = await createGroup(app, token, rideId, { name: 'A', paceKmh: 25 });
    await createGroup(app, token, rideId, { name: 'B', paceKmh: 30 });

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${rideId}/groups/${a.json().group.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
    });
    expect(response.statusCode).toBe(204);
    expect(
      (await listGroups(app, token, rideId)).map((g) => [g.name, g.position]),
    ).toEqual([['B', 0]]);
    await app.close();
  });

  it('refuses deleting a group with active registrations (409), allows it once they moved, and stays editable after publishing', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    const slow = await createGroup(app, token, rideId, {
      name: 'Группа 1',
      paceKmh: 25,
    });
    const fast = await createGroup(app, token, rideId, {
      name: 'Группа 2',
      paceKmh: 35,
    });
    await transition(app, token, rideId, 'publish');
    await transition(app, token, rideId, 'open-registration');

    const participant = await registerAndLoginUser(app);
    const register = await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: participant },
      payload: { groupId: slow.json().group.id },
    });
    expect(register.statusCode).toBe(201);

    const blocked = await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${rideId}/groups/${slow.json().group.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
    });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().code).toBe('group_has_registrations');
    expect(
      (await listGroups(app, token, rideId)).map((g) => g.registrationsCount),
    ).toEqual([1, 0]);

    // Published ride: still editable (not draft-only, unlike stops).
    const rename = await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}/groups/${fast.json().group.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: { name: 'Спорт' },
    });
    expect(rename.statusCode).toBe(200);

    const move = await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: participant },
      payload: { groupId: fast.json().group.id },
    });
    expect(move.statusCode).toBe(200);

    const allowed = await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${rideId}/groups/${slow.json().group.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
    });
    expect(allowed.statusCode).toBe(204);
    await app.close();
  });

  it('lets a cancelled registration no longer block a delete', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    const group = await createGroup(app, token, rideId, {
      name: 'Группа 1',
      paceKmh: 25,
    });
    await transition(app, token, rideId, 'publish');
    await transition(app, token, rideId, 'open-registration');
    const participant = await registerAndLoginUser(app);
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: participant },
      payload: { groupId: group.json().group.id },
    });
    await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${rideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: participant },
    });

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${rideId}/groups/${group.json().group.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
    });
    expect(response.statusCode).toBe(204);
    const [row] = await app.db.execute<{ group_id: string | null }>(
      sql`SELECT group_id FROM registrations WHERE ride_id = ${rideId}`,
    );
    expect(row?.group_id).toBeNull();
    await app.close();
  });

  it('freezes groups on a cancelled ride with 409 ride_groups_not_editable', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    const group = await createGroup(app, token, rideId, {
      name: 'Группа 1',
      paceKmh: 25,
    });
    await transition(app, token, rideId, 'publish');
    await transition(app, token, rideId, 'cancel');

    const create = await createGroup(app, token, rideId, {
      name: 'Группа 2',
      paceKmh: 30,
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${rideId}/groups/${group.json().group.id}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
    });
    for (const response of [create, remove]) {
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_groups_not_editable');
    }
    // Reading is still fine.
    expect(await listGroups(app, token, rideId)).toHaveLength(1);
    await app.close();
  });

  it('embeds groups (position order, live counts) in GET /v1/rides/:id', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    await createGroup(app, token, rideId, { name: 'Группа 1', paceKmh: 25 });
    const fast = await createGroup(app, token, rideId, {
      name: 'Группа 2',
      paceKmh: 35,
    });
    await transition(app, token, rideId, 'publish');
    await transition(app, token, rideId, 'open-registration');
    const participant = await registerAndLoginUser(app);
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: participant },
      payload: { groupId: fast.json().group.id },
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}`,
      cookies: { session: participant },
    });
    expect(detail.json().groups).toEqual([
      {
        id: expect.any(String),
        name: 'Группа 1',
        paceKmh: 25,
        description: null,
        position: 0,
        registrationsCount: 0,
      },
      {
        id: fast.json().group.id,
        name: 'Группа 2',
        paceKmh: 35,
        description: null,
        position: 1,
        registrationsCount: 1,
      },
    ]);
    expect(detail.json().viewerRegistration.groupId).toBe(fast.json().group.id);

    const anonymous = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}`,
    });
    expect(anonymous.json().groups).toHaveLength(2);
    await app.close();
  });
});

describe('GET /v1/rides card fields (CR-116)', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  it('defaults every card field for a bare published ride', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    await transition(app, token, rideId, 'publish');

    const response = await app.inject({ method: 'GET', url: '/v1/rides' });
    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      id: rideId,
      registrationsCount: 0,
      startLabel: null,
      routePreview: null,
      groups: [],
    });
    await app.close();
  });

  it('carries registrationsCount, startLabel, a simplified routePreview and groups', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOrganizerRide(app);
    await createGroup(app, token, rideId, { name: 'Группа 1', paceKmh: 25 });
    await createGroup(app, token, rideId, { name: 'Группа 2', paceKmh: 35 });
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/route-points`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: {
        type: 'start',
        label: 'Кофейня «Зерно»',
        lat: 55.75,
        lng: 37.61,
      },
    });
    // A 1000-point zigzag, inserted directly (a GPX upload needs S3, which this
    // suite doesn't run) — the preview must come back at ≤ 40 points, endpoints kept.
    const geometry = Array.from({ length: 1000 }, (_, i) => ({
      lat: 55.7 + i * 0.0005,
      lng: 37.6 + (i % 2 === 0 ? 0 : 0.0003) + Math.sin(i / 50) * 0.02,
      elevationMeters: 150,
    }));
    await app.db.insert(routes).values({
      rideId,
      gpxFileKey: 'test/route.gpx',
      gpxFileName: 'route.gpx',
      gpxFileSizeBytes: 1,
      distanceKm: 55.6,
      elevationGainMeters: 0,
      pointCount: geometry.length,
      geometry,
    });
    await transition(app, token, rideId, 'publish');
    await transition(app, token, rideId, 'open-registration');
    const groups = await listGroups(app, token, rideId);
    const participant = await registerAndLoginUser(app);
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/register`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: participant },
      payload: { groupId: groups[0]!.id },
    });

    const response = await app.inject({ method: 'GET', url: '/v1/rides' });
    const item = response.json().items[0];
    expect(item.registrationsCount).toBe(1);
    expect(item.startLabel).toBe('Кофейня «Зерно»');
    expect(item.groups).toEqual([
      { name: 'Группа 1', paceKmh: 25 },
      { name: 'Группа 2', paceKmh: 35 },
    ]);
    expect(item.routePreview.length).toBeGreaterThan(2);
    expect(item.routePreview.length).toBeLessThanOrEqual(40);
    expect(item.routePreview[0]).toEqual([55.7, 37.6]);
    const lastPoint = geometry[geometry.length - 1]!;
    expect(item.routePreview[item.routePreview.length - 1]).toEqual([
      Math.round(lastPoint.lat * 1e5) / 1e5,
      Math.round(lastPoint.lng * 1e5) / 1e5,
    ]);
    await app.close();
  });
});
