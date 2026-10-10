import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { grantAdmin, listAdmins, revokeAdmin } from 'db/admin-grants';
import { adminActions, platformAdmins, users } from 'db/schema';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-229/CR-230 (ADR-032). Real Postgres, same cleanup order as the other suites
// (`rides` before `users` — `rides.organizer_id` is `ON DELETE RESTRICT`).
// `platform_admins` cascades from `users`; `admin_actions` has no FK to its target,
// so it is cleared explicitly.
const DATABASE_URL = getTestDatabaseUrl();
const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'a-strong-password-123';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
  WEB_ORIGIN,
});

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App;

async function cleanDatabase() {
  const cleaner = await buildApp(testEnv);
  await cleaner.db.execute(sql`DELETE FROM admin_actions`);
  await cleaner.db.execute(sql`DELETE FROM rides`);
  await cleaner.db.execute(sql`DELETE FROM users`);
  await cleaner.close();
}

function request(
  method: 'GET' | 'POST',
  url: string,
  token?: string,
  payload?: unknown,
) {
  return app.inject({
    method,
    url,
    headers: { origin: WEB_ORIGIN },
    ...(token ? { cookies: { session: token } } : {}),
    ...(payload !== undefined ? { payload: payload as object } : {}),
  });
}

async function login(email: string, password = PASSWORD) {
  return request('POST', '/v1/auth/login', undefined, { email, password });
}

/** Registers a user; verifies the email unless `verified: false`; signs in. */
async function createUser({ verified = true } = {}) {
  const email = `${randomUUID()}@example.test`;
  const register = await request('POST', '/v1/auth/register', undefined, {
    email,
    password: PASSWORD,
  });
  const verificationToken = new URL(
    register.json().verificationUrl as string,
    'http://internal',
  ).searchParams.get('token')!;
  if (verified) {
    await request('POST', '/v1/auth/verify-email', undefined, {
      token: verificationToken,
    });
  }
  const signIn = await login(email);
  return {
    email,
    userId: signIn.json().user.id as string,
    token: signIn.cookies.find((c) => c.name === 'session')!.value,
    verificationToken,
  };
}

async function createAdmin() {
  const admin = await createUser();
  expect(await grantAdmin(app.db, admin.email)).toBe('granted');
  return admin;
}

/** An organizer with a published, registration-open ride. */
async function createOpenRide() {
  const organizer = await createUser();
  await request('POST', '/v1/organizers/me', organizer.token, {
    name: 'Гравийный клуб',
  });
  const ride = await request('POST', '/v1/rides', organizer.token, {
    title: 'Утренний гревел',
    bicycleType: 'gravel',
    startsAt: '2027-05-01T05:00:00.000Z',
    startTimezone: 'Europe/Moscow',
  });
  const rideId = ride.json().ride.id as string;
  await request('POST', `/v1/rides/${rideId}/publish`, organizer.token);
  await request(
    'POST',
    `/v1/rides/${rideId}/open-registration`,
    organizer.token,
  );
  return { organizer, rideId };
}

/** A finished ride with one confirmed participant who left a review. */
async function createReview() {
  const { organizer, rideId } = await createOpenRide();
  const participant = await createUser();
  await request('POST', `/v1/rides/${rideId}/register`, participant.token);
  for (const step of ['close-registration', 'start', 'finish']) {
    await request('POST', `/v1/rides/${rideId}/${step}`, organizer.token);
  }
  await request('POST', `/v1/rides/${rideId}/finish-claim`, participant.token);
  await request(
    'POST',
    `/v1/rides/${rideId}/attendance/confirm-claimed`,
    organizer.token,
  );
  const review = await request(
    'POST',
    `/v1/rides/${rideId}/reviews`,
    participant.token,
    { rating: 1, comment: 'Спам' },
  );
  expect(review.statusCode).toBe(201);
  return { rideId, reviewId: review.json().review.id as string };
}

describe('Admin API (CR-229/CR-230, ADR-032)', () => {
  beforeEach(async () => {
    await cleanDatabase();
    app = await buildApp(testEnv);
    return () => app.close();
  });

  afterAll(cleanDatabase);

  describe('access', () => {
    it('answers 401 without a session', async () => {
      const response = await request('GET', '/v1/admin/me');
      expect(response.statusCode).toBe(401);
    });

    it('answers a signed-in non-admin with the unknown-route 404', async () => {
      const user = await createUser();
      for (const [method, url] of [
        ['GET', '/v1/admin/me'],
        ['GET', '/v1/admin/users'],
        ['POST', `/v1/admin/users/${user.userId}/block`],
      ] as const) {
        const response = await request(method, url, user.token, {
          reason: 'x',
        });
        expect(response.statusCode).toBe(404);
        expect(response.json().code).toBe('not_found');
      }
    });

    it('serves an admin, and a CLI revoke takes effect on the next request', async () => {
      const admin = await createAdmin();
      const me = await request('GET', '/v1/admin/me', admin.token);
      expect(me.statusCode).toBe(200);
      expect(me.json()).toEqual({
        admin: { userId: admin.userId, email: admin.email },
      });

      expect(await grantAdmin(app.db, admin.email)).toBe('already_admin');
      expect(await listAdmins(app.db)).toHaveLength(1);
      expect(await revokeAdmin(app.db, admin.email)).toBe('revoked');
      expect(await revokeAdmin(app.db, admin.email)).toBe('not_admin');
      expect(await grantAdmin(app.db, 'nobody@example.test')).toBe(
        'user_not_found',
      );

      const after = await request('GET', '/v1/admin/me', admin.token);
      expect(after.statusCode).toBe(404);
    });
  });

  describe('grantAdmin (host CLI, CR-232)', () => {
    const grantRows = (userId: string) =>
      app.db
        .select({ action: adminActions.action })
        .from(adminActions)
        .where(eq(adminActions.targetId, userId));

    it('grants a verified user once and logs it; a repeat grant changes nothing', async () => {
      const user = await createUser();

      expect(await grantAdmin(app.db, `  ${user.email.toUpperCase()} `)).toBe(
        'granted',
      );
      expect(await listAdmins(app.db)).toEqual([
        expect.objectContaining({ email: user.email }),
      ]);
      expect(await grantRows(user.userId)).toEqual([
        { action: 'admin_granted' },
      ]);

      expect(await grantAdmin(app.db, user.email)).toBe('already_admin');
      expect(await listAdmins(app.db)).toHaveLength(1);
      expect(await grantRows(user.userId)).toHaveLength(1);
    });

    it('reports an unknown email', async () => {
      expect(await grantAdmin(app.db, 'nobody@example.test')).toBe(
        'user_not_found',
      );
      expect(await listAdmins(app.db)).toEqual([]);
    });

    it('refuses a user whose email is not verified, writing nothing', async () => {
      const user = await createUser({ verified: false });

      expect(await grantAdmin(app.db, user.email)).toBe('email_not_verified');
      expect(await listAdmins(app.db)).toEqual([]);
      expect(await grantRows(user.userId)).toEqual([]);
      const me = await request('GET', '/v1/admin/me', user.token);
      expect(me.statusCode).toBe(404);
    });

    it('leaves an existing admin working even if the email is no longer verified', async () => {
      const admin = await createAdmin();
      await app.db
        .update(users)
        .set({ emailVerified: false })
        .where(eq(users.id, admin.userId));

      const me = await request('GET', '/v1/admin/me', admin.token);
      expect(me.statusCode).toBe(200);
      const rows = await app.db
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.userId, admin.userId));
      expect(rows).toHaveLength(1);
    });
  });

  describe('GET /v1/admin/overview', () => {
    it('counts the platform and reports dependencies', async () => {
      const admin = await createAdmin();
      await createUser({ verified: false });
      await createOpenRide();

      const response = await request('GET', '/v1/admin/overview', admin.token);
      expect(response.statusCode).toBe(200);
      const { overview } = response.json();
      expect(overview.users).toEqual({
        total: 3,
        newLast7Days: 3,
        unverified: 1,
        blocked: 0,
      });
      expect(overview.organizers.total).toBe(1);
      expect(overview.rides.byStatus.registration_open).toBe(1);
      expect(overview.rides.byStatus.draft).toBe(0);
      expect(overview.dependencies).toEqual({
        database: 'ok',
        redis: 'not_configured',
        s3: 'not_configured',
        email: 'not_configured',
        maps: 'not_configured',
      });
    });
  });

  describe('users', () => {
    it('lists newest first with search, filters and cursor pagination', async () => {
      const admin = await createAdmin();
      const unverified = await createUser({ verified: false });
      const { organizer } = await createOpenRide();

      const all = await request('GET', '/v1/admin/users?limit=2', admin.token);
      expect(all.statusCode).toBe(200);
      const firstPage = all.json();
      expect(firstPage.items.map((u: { id: string }) => u.id)).toEqual([
        organizer.userId,
        unverified.userId,
      ]);
      expect(firstPage.items[0].isOrganizer).toBe(true);
      expect(firstPage.items[0]).not.toHaveProperty('passwordHash');

      const second = await request(
        'GET',
        `/v1/admin/users?limit=2&cursor=${firstPage.nextCursor}`,
        admin.token,
      );
      expect(second.json().items).toEqual([
        expect.objectContaining({ id: admin.userId, isAdmin: true }),
      ]);
      expect(second.json().nextCursor).toBeNull();

      const search = await request(
        'GET',
        `/v1/admin/users?q=${unverified.email.slice(0, 12).toUpperCase()}`,
        admin.token,
      );
      expect(search.json().items.map((u: { id: string }) => u.id)).toEqual([
        unverified.userId,
      ]);

      const wildcard = await request(
        'GET',
        '/v1/admin/users?q=%25',
        admin.token,
      );
      expect(wildcard.json().items).toEqual([]);

      for (const [filter, expected] of [
        ['unverified', unverified.userId],
        ['organizers', organizer.userId],
      ]) {
        const filtered = await request(
          'GET',
          `/v1/admin/users?filter=${filter}`,
          admin.token,
        );
        expect(filtered.json().items.map((u: { id: string }) => u.id)).toEqual([
          expected,
        ]);
      }

      const badCursor = await request(
        'GET',
        `/v1/admin/users?cursor=${Buffer.from('{"sortValue":"x","id":"y"}').toString('base64url')}`,
        admin.token,
      );
      expect(badCursor.statusCode).toBe(400);
      expect(badCursor.json().code).toBe('invalid_cursor');
    });

    it('returns a user card without secrets, 404 for an unknown id', async () => {
      const admin = await createAdmin();
      const { organizer } = await createOpenRide();

      const response = await request(
        'GET',
        `/v1/admin/users/${organizer.userId}`,
        admin.token,
      );
      expect(response.statusCode).toBe(200);
      const { user } = response.json();
      expect(user).toMatchObject({
        email: organizer.email,
        organizer: { name: 'Гравийный клуб' },
        activeSessions: 1,
        ridesOrganized: 1,
        activeRegistrations: 0,
        reviewsWritten: 0,
      });
      for (const secret of ['passwordHash', 'phone', 'tokenHash']) {
        expect(user).not.toHaveProperty(secret);
      }

      const missing = await request(
        'GET',
        `/v1/admin/users/${randomUUID()}`,
        admin.token,
      );
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe('user_not_found');
    });

    it('verifies an email by hand and retires the mailed link', async () => {
      const admin = await createAdmin();
      const user = await createUser({ verified: false });

      const verify = await request(
        'POST',
        `/v1/admin/users/${user.userId}/verify-email`,
        admin.token,
      );
      expect(verify.statusCode).toBe(200);
      expect(verify.json().user.emailVerified).toBe(true);

      const again = await request(
        'POST',
        `/v1/admin/users/${user.userId}/verify-email`,
        admin.token,
      );
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('user_already_verified');

      const oldLink = await request(
        'POST',
        '/v1/auth/verify-email',
        undefined,
        {
          token: user.verificationToken,
        },
      );
      expect(oldLink.json().code).toBe('verification_token_already_used');

      const resend = await request(
        'POST',
        `/v1/admin/users/${user.userId}/resend-verification`,
        admin.token,
      );
      expect(resend.statusCode).toBe(409);
    });

    it('re-sends a verification link to an unverified user', async () => {
      const admin = await createAdmin();
      const user = await createUser({ verified: false });
      const resend = await request(
        'POST',
        `/v1/admin/users/${user.userId}/resend-verification`,
        admin.token,
      );
      expect(resend.statusCode).toBe(204);
      const oldLink = await request(
        'POST',
        '/v1/auth/verify-email',
        undefined,
        {
          token: user.verificationToken,
        },
      );
      expect(oldLink.json().code).toBe('verification_token_already_used');
    });

    it('logs a user out everywhere', async () => {
      const admin = await createAdmin();
      const user = await createUser();
      await login(user.email);

      const revoke = await request(
        'POST',
        `/v1/admin/users/${user.userId}/revoke-sessions`,
        admin.token,
      );
      expect(revoke.statusCode).toBe(200);
      expect(revoke.json()).toEqual({ revoked: 2 });
      const me = await request('GET', '/v1/auth/me', user.token);
      expect(me.statusCode).toBe(401);
    });

    it('blocks and unblocks: sessions die, login refuses, admins are exempt', async () => {
      const admin = await createAdmin();
      const user = await createUser();
      const url = `/v1/admin/users/${user.userId}`;

      const noReason = await request('POST', `${url}/block`, admin.token, {
        reason: '   ',
      });
      expect(noReason.statusCode).toBe(400);

      const block = await request('POST', `${url}/block`, admin.token, {
        reason: 'Спам в отзывах',
      });
      expect(block.statusCode).toBe(200);
      expect(block.json().user).toMatchObject({
        blockReason: 'Спам в отзывах',
        activeSessions: 0,
      });
      expect(block.json().user.blockedAt).not.toBeNull();

      expect((await request('GET', '/v1/auth/me', user.token)).statusCode).toBe(
        401,
      );
      const blockedLogin = await login(user.email);
      expect(blockedLogin.statusCode).toBe(403);
      expect(blockedLogin.json().code).toBe('account_blocked');
      expect(blockedLogin.cookies).toHaveLength(0);
      const wrongPassword = await login(user.email, 'not-the-password-1');
      expect(wrongPassword.json().code).toBe('invalid_credentials');

      const twice = await request('POST', `${url}/block`, admin.token, {
        reason: 'x',
      });
      expect(twice.json().code).toBe('user_already_blocked');

      const blockAdmin = await request(
        'POST',
        `/v1/admin/users/${admin.userId}/block`,
        admin.token,
        { reason: 'x' },
      );
      expect(blockAdmin.statusCode).toBe(409);
      expect(blockAdmin.json().code).toBe('cannot_block_admin');

      const blockedList = await request(
        'GET',
        '/v1/admin/users?filter=blocked',
        admin.token,
      );
      expect(blockedList.json().items).toHaveLength(1);

      const unblock = await request('POST', `${url}/unblock`, admin.token);
      expect(unblock.statusCode).toBe(200);
      expect(unblock.json().user.blockedAt).toBeNull();
      expect((await login(user.email)).statusCode).toBe(200);

      const unblockTwice = await request('POST', `${url}/unblock`, admin.token);
      expect(unblockTwice.json().code).toBe('user_not_blocked');
    });
  });

  describe('rides', () => {
    it('lists every ride, drafts included, with filters', async () => {
      const admin = await createAdmin();
      const { rideId } = await createOpenRide();
      const organizer = await createUser();
      await request('POST', '/v1/organizers/me', organizer.token, {
        name: 'Второй клуб',
      });
      const draft = await request('POST', '/v1/rides', organizer.token, {
        title: 'Черновик',
        bicycleType: 'road',
        startsAt: '2027-06-01T05:00:00.000Z',
        startTimezone: 'Europe/Moscow',
      });

      const all = await request('GET', '/v1/admin/rides', admin.token);
      expect(all.statusCode).toBe(200);
      expect(all.json().items.map((r: { id: string }) => r.id)).toEqual([
        draft.json().ride.id,
        rideId,
      ]);

      const drafts = await request(
        'GET',
        '/v1/admin/rides?status=draft&q=черн',
        admin.token,
      );
      expect(drafts.json().items).toEqual([
        expect.objectContaining({
          title: 'Черновик',
          organizer: expect.objectContaining({ name: 'Второй клуб' }),
          activeRegistrations: 0,
          hiddenAt: null,
        }),
      ]);
    });

    it('hides a ride from everyone but its organizer, and unhides it', async () => {
      const admin = await createAdmin();
      const { organizer, rideId } = await createOpenRide();
      const participant = await createUser();

      const hide = await request(
        'POST',
        `/v1/admin/rides/${rideId}/hide`,
        admin.token,
        { reason: 'Реклама' },
      );
      expect(hide.statusCode).toBe(200);
      expect(hide.json().ride).toMatchObject({ hiddenReason: 'Реклама' });

      expect((await request('GET', `/v1/rides/${rideId}`)).statusCode).toBe(
        404,
      );
      expect(
        (await request('GET', `/v1/rides/${rideId}`, participant.token))
          .statusCode,
      ).toBe(404);
      const ownView = await request(
        'GET',
        `/v1/rides/${rideId}`,
        organizer.token,
      );
      expect(ownView.statusCode).toBe(200);
      // CR-231: only the organizer is told why.
      expect(ownView.json().moderation).toMatchObject({ reason: 'Реклама' });
      expect((await request('GET', '/v1/rides')).json().items).toEqual([]);
      for (const path of [
        'route/geometry',
        'route/download',
        'riders',
        'cover',
      ]) {
        const response = await request(
          'GET',
          `/v1/rides/${rideId}/${path}`,
          participant.token,
        );
        expect(response.json().code).toBe('ride_not_found');
      }
      const register = await request(
        'POST',
        `/v1/rides/${rideId}/register`,
        participant.token,
      );
      expect(register.statusCode).toBe(404);

      const twice = await request(
        'POST',
        `/v1/admin/rides/${rideId}/hide`,
        admin.token,
        { reason: 'x' },
      );
      expect(twice.json().code).toBe('ride_already_hidden');
      const hiddenOnly = await request(
        'GET',
        '/v1/admin/rides?visibility=hidden',
        admin.token,
      );
      expect(hiddenOnly.json().items).toHaveLength(1);

      const unhide = await request(
        'POST',
        `/v1/admin/rides/${rideId}/unhide`,
        admin.token,
      );
      expect(unhide.json().ride.hiddenAt).toBeNull();
      const publicView = await request('GET', `/v1/rides/${rideId}`);
      expect(publicView.statusCode).toBe(200);
      expect(publicView.json().moderation).toBeNull();
      expect(
        (await request('GET', `/v1/rides/${rideId}`, organizer.token)).json()
          .moderation,
      ).toBeNull();
      expect(
        (
          await request('POST', `/v1/admin/rides/${rideId}/unhide`, admin.token)
        ).json().code,
      ).toBe('ride_not_hidden');
      expect(
        (
          await request(
            'POST',
            `/v1/admin/rides/${randomUUID()}/hide`,
            admin.token,
            { reason: 'x' },
          )
        ).json().code,
      ).toBe('ride_not_found');
    });

    it('cancels any organizer’s ride and notifies its participants', async () => {
      const admin = await createAdmin();
      const { rideId } = await createOpenRide();
      const participant = await createUser();
      await request('POST', `/v1/rides/${rideId}/register`, participant.token);

      const cancel = await request(
        'POST',
        `/v1/admin/rides/${rideId}/cancel`,
        admin.token,
        { reason: 'Организатор недоступен' },
      );
      expect(cancel.statusCode).toBe(200);
      expect(cancel.json().ride.status).toBe('cancelled');

      const inbox = await request(
        'GET',
        '/v1/notifications/mine',
        participant.token,
      );
      expect(inbox.json().items[0]).toMatchObject({ type: 'ride_cancelled' });

      const again = await request(
        'POST',
        `/v1/admin/rides/${rideId}/cancel`,
        admin.token,
        { reason: 'x' },
      );
      expect(again.statusCode).toBe(409);
      expect(again.json().code).toBe('ride_not_cancellable');
      const missing = await request(
        'POST',
        `/v1/admin/rides/${randomUUID()}/cancel`,
        admin.token,
        { reason: 'x' },
      );
      expect(missing.json().code).toBe('ride_not_found');
    });
  });

  describe('reviews', () => {
    it('hides a review from the ride and the organizer rating', async () => {
      const admin = await createAdmin();
      const { rideId, reviewId } = await createReview();

      const list = await request('GET', '/v1/admin/reviews', admin.token);
      expect(list.json().items).toEqual([
        expect.objectContaining({
          id: reviewId,
          rating: 1,
          ride: { id: rideId, title: 'Утренний гревел' },
        }),
      ]);

      const hide = await request(
        'POST',
        `/v1/admin/reviews/${reviewId}/hide`,
        admin.token,
        { reason: 'Оскорбления' },
      );
      expect(hide.statusCode).toBe(200);
      expect(hide.json().review.hiddenReason).toBe('Оскорбления');

      const publicList = await request('GET', `/v1/rides/${rideId}/reviews`);
      expect(publicList.json().items).toEqual([]);
      const ride = await request('GET', `/v1/rides/${rideId}`);
      expect(ride.json().organizer).toMatchObject({
        rating: null,
        reviewCount: 0,
      });
      expect(
        (
          await request(
            'POST',
            `/v1/admin/reviews/${reviewId}/hide`,
            admin.token,
            { reason: 'x' },
          )
        ).json().code,
      ).toBe('review_already_hidden');

      const unhide = await request(
        'POST',
        `/v1/admin/reviews/${reviewId}/unhide`,
        admin.token,
      );
      expect(unhide.json().review.hiddenAt).toBeNull();
      expect(
        (await request('GET', `/v1/rides/${rideId}/reviews`)).json().items,
      ).toHaveLength(1);
      expect(
        (
          await request(
            'POST',
            `/v1/admin/reviews/${reviewId}/unhide`,
            admin.token,
          )
        ).json().code,
      ).toBe('review_not_hidden');
      expect(
        (
          await request(
            'GET',
            '/v1/admin/reviews?visibility=hidden',
            admin.token,
          )
        ).json().items,
      ).toEqual([]);
    });
  });

  describe('GET /v1/admin/actions', () => {
    it('logs every action newest first, labelled, filterable by target', async () => {
      const admin = await createAdmin();
      const user = await createUser();
      const { rideId } = await createOpenRide();
      await request(
        'POST',
        `/v1/admin/users/${user.userId}/block`,
        admin.token,
        {
          reason: 'Спам',
        },
      );
      await request('POST', `/v1/admin/rides/${rideId}/hide`, admin.token, {
        reason: 'Реклама',
      });

      const log = await request('GET', '/v1/admin/actions', admin.token);
      expect(log.statusCode).toBe(200);
      expect(log.json().items).toEqual([
        expect.objectContaining({
          action: 'ride_hidden',
          targetLabel: 'Утренний гревел',
          reason: 'Реклама',
          admin: { id: admin.userId, email: admin.email },
        }),
        expect.objectContaining({
          action: 'user_blocked',
          targetLabel: user.email,
          reason: 'Спам',
        }),
        expect.objectContaining({
          action: 'admin_granted',
          targetId: admin.userId,
          admin: null,
        }),
      ]);

      const forUser = await request(
        'GET',
        `/v1/admin/actions?targetType=user&targetId=${user.userId}`,
        admin.token,
      );
      expect(forUser.json().items).toHaveLength(1);
    });

    it('filters by action type, alone or with the target type (CR-232)', async () => {
      const admin = await createAdmin();
      const user = await createUser();
      const { rideId } = await createOpenRide();
      await request(
        'POST',
        `/v1/admin/users/${user.userId}/block`,
        admin.token,
        { reason: 'Спам' },
      );
      await request(
        'POST',
        `/v1/admin/users/${user.userId}/unblock`,
        admin.token,
      );
      await request('POST', `/v1/admin/rides/${rideId}/hide`, admin.token, {
        reason: 'Реклама',
      });

      const blocked = await request(
        'GET',
        '/v1/admin/actions?action=user_blocked',
        admin.token,
      );
      expect(blocked.statusCode).toBe(200);
      expect(
        blocked.json().items.map((item: { action: string }) => item.action),
      ).toEqual(['user_blocked']);

      const userActions = await request(
        'GET',
        '/v1/admin/actions?targetType=user',
        admin.token,
      );
      expect(
        userActions.json().items.map((item: { action: string }) => item.action),
      ).toEqual(['user_unblocked', 'user_blocked', 'admin_granted']);

      const none = await request(
        'GET',
        '/v1/admin/actions?targetType=ride&action=user_blocked',
        admin.token,
      );
      expect(none.json()).toEqual({ items: [], nextCursor: null });

      const invalid = await request(
        'GET',
        '/v1/admin/actions?action=drop_table',
        admin.token,
      );
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().code).toBe('validation_error');
    });

    it('stays append-only — no route edits or deletes a log row (CR-232)', async () => {
      const admin = await createAdmin();
      const [row] = (
        await request('GET', '/v1/admin/actions', admin.token)
      ).json().items as Array<{ id: string }>;
      for (const method of ['DELETE', 'PATCH', 'PUT'] as const) {
        const response = await app.inject({
          method,
          url: `/v1/admin/actions/${row!.id}`,
          headers: { origin: WEB_ORIGIN },
          cookies: { session: admin.token },
          payload: { reason: 'x' },
        });
        expect(response.statusCode).toBe(404);
      }
      expect(
        (await request('GET', '/v1/admin/actions', admin.token)).json().items,
      ).toHaveLength(1);
    });
  });
});
