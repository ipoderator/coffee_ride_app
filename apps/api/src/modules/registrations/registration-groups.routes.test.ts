import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-117 ("Pace groups") — the participant side: choosing a group at register/
// waitlist time, carrying it through promotion, changing it, and the two lists that
// show it (organizer `/participants`, signed-in-only `/riders`). Same real-Postgres
// rationale as `registrations.routes.test.ts`.
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

/**
 * Registers, verifies, logs in a fresh user; optionally sets a display name and a
 * phone (private data the rider list must never echo back).
 */
async function registerAndLoginUser(app: App, displayName?: string) {
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
  const rawToken = login.cookies.find((c) => c.name === 'session')!.value;
  if (displayName) {
    const patch = await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rawToken },
      payload: { displayName, phone: '+79991234567' },
    });
    expect(patch.statusCode).toBe(200);
  }
  return { rawToken, email, userId: login.json().user.id as string };
}

/**
 * An organizer with a ride in `registration_open`, optionally with groups (created
 * while still `draft`) and a participant limit.
 */
async function createOpenRide(
  app: App,
  options: { groups?: Array<[string, number]>; participantLimit?: number } = {},
) {
  const { rawToken: token } = await registerAndLoginUser(app);
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
  const rideId = ride.json().ride.id as string;
  if (options.participantLimit !== undefined) {
    await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: { participantLimit: options.participantLimit },
    });
  }
  const groupIds: string[] = [];
  for (const [name, paceKmh] of options.groups ?? []) {
    const group = await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/groups`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: { name, paceKmh },
    });
    groupIds.push(group.json().group.id);
  }
  for (const action of ['publish', 'open-registration']) {
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/${action}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
    });
  }
  return { token, rideId, groupIds };
}

function register(
  app: App,
  token: string,
  rideId: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/register`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: token },
    ...(payload ? { payload } : {}),
  });
}

const TWO_GROUPS: Array<[string, number]> = [
  ['Группа 1', 25],
  ['Группа 2', 35],
];

describe('registration into pace groups (CR-117)', () => {
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
    it('still registers with no body at all on a ride without groups (groupId: null)', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOpenRide(app);
      const participant = await registerAndLoginUser(app);

      const response = await register(app, participant.rawToken, rideId);
      expect(response.statusCode).toBe(201);
      expect(response.json().registration.groupId).toBeNull();
      await app.close();
    });

    it('rejects a groupId on a ride without groups with 422 group_not_found', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOpenRide(app);
      const participant = await registerAndLoginUser(app);

      const response = await register(app, participant.rawToken, rideId, {
        groupId: randomUUID(),
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe('group_not_found');
      await app.close();
    });

    it('requires a group once the ride has any (422 group_required), and registers into the chosen one', async () => {
      const app = await buildApp(testEnv);
      const { rideId, groupIds } = await createOpenRide(app, {
        groups: TWO_GROUPS,
      });
      const participant = await registerAndLoginUser(app);

      const missing = await register(app, participant.rawToken, rideId);
      expect(missing.statusCode).toBe(422);
      expect(missing.json().code).toBe('group_required');

      const ok = await register(app, participant.rawToken, rideId, {
        groupId: groupIds[1],
      });
      expect(ok.statusCode).toBe(201);
      expect(ok.json().registration.groupId).toBe(groupIds[1]);

      // Idempotent replay (CR-083) returns the existing registration unchanged,
      // even with a different groupId — changing groups is `PATCH`'s job.
      const replay = await register(app, participant.rawToken, rideId, {
        groupId: groupIds[0],
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json().registration.groupId).toBe(groupIds[1]);
      await app.close();
    });

    it("rejects another ride's group with 422 group_not_found", async () => {
      const app = await buildApp(testEnv);
      const first = await createOpenRide(app, { groups: TWO_GROUPS });
      const second = await createOpenRide(app, { groups: TWO_GROUPS });
      const participant = await registerAndLoginUser(app);

      const response = await register(app, participant.rawToken, first.rideId, {
        groupId: second.groupIds[0],
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().code).toBe('group_not_found');
      await app.close();
    });

    it('rejects a malformed groupId with 400 validation_error', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createOpenRide(app, { groups: TWO_GROUPS });
      const participant = await registerAndLoginUser(app);

      const response = await register(app, participant.rawToken, rideId, {
        groupId: 'not-a-uuid',
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');
      await app.close();
    });

    it('keeps capacity ride-level: full is full across groups (409 ride_full)', async () => {
      const app = await buildApp(testEnv);
      const { rideId, groupIds } = await createOpenRide(app, {
        groups: TWO_GROUPS,
        participantLimit: 1,
      });
      const first = await registerAndLoginUser(app);
      const second = await registerAndLoginUser(app);

      expect(
        (await register(app, first.rawToken, rideId, { groupId: groupIds[0] }))
          .statusCode,
      ).toBe(201);
      const full = await register(app, second.rawToken, rideId, {
        groupId: groupIds[1],
      });
      expect(full.statusCode).toBe(409);
      expect(full.json().code).toBe('ride_full');
      await app.close();
    });
  });

  describe('waitlist', () => {
    it('requires a group to join, and carries it into the promoted registration', async () => {
      const app = await buildApp(testEnv);
      const { rideId, groupIds } = await createOpenRide(app, {
        groups: TWO_GROUPS,
        participantLimit: 1,
      });
      const holder = await registerAndLoginUser(app);
      const waiting = await registerAndLoginUser(app);
      await register(app, holder.rawToken, rideId, { groupId: groupIds[0] });

      const noGroup = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: waiting.rawToken },
      });
      expect(noGroup.statusCode).toBe(422);
      expect(noGroup.json().code).toBe('group_required');

      const join = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: waiting.rawToken },
        payload: { groupId: groupIds[1] },
      });
      expect(join.statusCode).toBe(201);
      expect(join.json().waitlistEntry.groupId).toBe(groupIds[1]);

      await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: holder.rawToken },
      });

      const detail = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
        cookies: { session: waiting.rawToken },
      });
      expect(detail.json().viewerRegistration.groupId).toBe(groupIds[1]);
      await app.close();
    });

    it('refuses deleting a group a waiting entry points at (409 group_has_registrations)', async () => {
      const app = await buildApp(testEnv);
      const { token, rideId, groupIds } = await createOpenRide(app, {
        groups: TWO_GROUPS,
        participantLimit: 1,
      });
      const holder = await registerAndLoginUser(app);
      const waiting = await registerAndLoginUser(app);
      await register(app, holder.rawToken, rideId, { groupId: groupIds[0] });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/waitlist`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: waiting.rawToken },
        payload: { groupId: groupIds[1] },
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/groups/${groupIds[1]}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: token },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('group_has_registrations');
      await app.close();
    });
  });

  describe('PATCH /v1/rides/:id/register', () => {
    it('moves the caller’s own registration to another group of the same ride', async () => {
      const app = await buildApp(testEnv);
      const { rideId, groupIds } = await createOpenRide(app, {
        groups: TWO_GROUPS,
      });
      const other = await createOpenRide(app, { groups: TWO_GROUPS });
      const participant = await registerAndLoginUser(app);
      await register(app, participant.rawToken, rideId, {
        groupId: groupIds[0],
      });

      const moved = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { groupId: groupIds[1] },
      });
      expect(moved.statusCode).toBe(200);
      expect(moved.json().registration).toMatchObject({
        rideId,
        userId: participant.userId,
        status: 'active',
        groupId: groupIds[1],
      });

      const foreign = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { groupId: other.groupIds[0] },
      });
      expect(foreign.statusCode).toBe(422);
      expect(foreign.json().code).toBe('group_not_found');
      await app.close();
    });

    it('rejects 401 without a session and 404 registration_not_found without an active registration', async () => {
      const app = await buildApp(testEnv);
      const { rideId, groupIds } = await createOpenRide(app, {
        groups: TWO_GROUPS,
      });
      const participant = await registerAndLoginUser(app);

      const anonymous = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        payload: { groupId: groupIds[0] },
      });
      expect(anonymous.statusCode).toBe(401);

      const notRegistered = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { groupId: groupIds[0] },
      });
      expect(notRegistered.statusCode).toBe(404);
      expect(notRegistered.json().code).toBe('registration_not_found');
      await app.close();
    });

    it('refuses a change once the ride is cancelled (409 group_change_not_allowed)', async () => {
      const app = await buildApp(testEnv);
      const { token, rideId, groupIds } = await createOpenRide(app, {
        groups: TWO_GROUPS,
      });
      const participant = await registerAndLoginUser(app);
      await register(app, participant.rawToken, rideId, {
        groupId: groupIds[0],
      });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cancel`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: token },
      });

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/register`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: participant.rawToken },
        payload: { groupId: groupIds[1] },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('group_change_not_allowed');
      await app.close();
    });
  });

  describe('lists', () => {
    it('adds group to the organizer participant list (null for a group-less registration)', async () => {
      const app = await buildApp(testEnv);
      const { token, rideId } = await createOpenRide(app);
      const early = await registerAndLoginUser(app, 'Ранний Участник');
      await register(app, early.rawToken, rideId);
      // Groups added after someone already registered: that registration keeps null.
      const group = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/groups`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: token },
        payload: { name: 'Группа 1', paceKmh: 27.5 },
      });
      const late = await registerAndLoginUser(app, 'Поздний Участник');
      await register(app, late.rawToken, rideId, {
        groupId: group.json().group.id,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/participants`,
        cookies: { session: token },
      });
      expect(response.statusCode).toBe(200);
      expect(
        response
          .json()
          .items.map((item: { displayName: string; group: unknown }) => [
            item.displayName,
            item.group,
          ]),
      ).toEqual([
        ['Ранний Участник', null],
        [
          'Поздний Участник',
          { id: group.json().group.id, name: 'Группа 1', paceKmh: 27.5 },
        ],
      ]);
      await app.close();
    });

    it('GET /v1/rides/:id/riders: 401 anonymous; signed-in sees name + group only, no private fields', async () => {
      const app = await buildApp(testEnv);
      const { rideId, groupIds } = await createOpenRide(app, {
        groups: TWO_GROUPS,
      });
      const rider = await registerAndLoginUser(app, 'Тест Участник');
      await register(app, rider.rawToken, rideId, { groupId: groupIds[1] });
      const viewer = await registerAndLoginUser(app);

      const anonymous = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/riders`,
      });
      expect(anonymous.statusCode).toBe(401);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/riders`,
        cookies: { session: viewer.rawToken },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        items: [
          {
            registrationId: expect.any(String),
            displayName: 'Тест Участник',
            group: { id: groupIds[1], name: 'Группа 2', paceKmh: 35 },
          },
        ],
        nextCursor: null,
      });
      expect(response.body).not.toContain(rider.userId);
      expect(response.body).not.toContain(rider.email);
      expect(response.body).not.toContain('+79991234567');
      await app.close();
    });

    it('GET /v1/rides/:id/riders: 404 ride_not_found for someone else’s draft, paginates, rejects a bad cursor', async () => {
      const app = await buildApp(testEnv);
      const viewer = await registerAndLoginUser(app);
      await app.inject({
        method: 'POST',
        url: '/v1/organizers/me',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: viewer.rawToken },
        payload: { name: 'Клуб зрителя' },
      });
      const { rideId } = await createOpenRide(app);
      const a = await registerAndLoginUser(app, 'Первый');
      const b = await registerAndLoginUser(app, 'Второй');
      await register(app, a.rawToken, rideId);
      await register(app, b.rawToken, rideId);

      // A draft owned by the viewer (someone other than `b`): invisible to `b`.
      const draft = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: viewer.rawToken },
        payload: {
          title: 'Черновик',
          bicycleType: 'road',
          startsAt: '2027-05-01T05:00:00.000Z',
          startTimezone: 'Europe/Moscow',
        },
      });
      const hidden = await app.inject({
        method: 'GET',
        url: `/v1/rides/${draft.json().ride.id}/riders`,
        cookies: { session: b.rawToken },
      });
      expect(hidden.statusCode).toBe(404);
      expect(hidden.json().code).toBe('ride_not_found');

      const first = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/riders?limit=1`,
        cookies: { session: viewer.rawToken },
      });
      expect(first.json().items).toEqual([
        {
          registrationId: expect.any(String),
          displayName: 'Первый',
          group: null,
        },
      ]);
      const second = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/riders?limit=1&cursor=${first.json().nextCursor}`,
        cookies: { session: viewer.rawToken },
      });
      expect(second.json()).toEqual({
        items: [
          {
            registrationId: expect.any(String),
            displayName: 'Второй',
            group: null,
          },
        ],
        nextCursor: null,
      });

      const bad = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/riders?cursor=garbage`,
        cookies: { session: viewer.rawToken },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json().code).toBe('invalid_cursor');
      await app.close();
    });
  });
});
