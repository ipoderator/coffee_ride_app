import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { notifications, rideUpdates, rides } from 'db/schema';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';
import {
  NotificationQueueUnavailableError,
  processNotificationJob,
  type NotificationQueue,
} from '../notifications/notifications.service.js';
import { rescheduleRide } from './rides.service.js';

// CR-190 (ADR-029 draft): `POST /v1/rides/:id/reschedule`. Real Postgres, same
// rationale as `rides.routes.test.ts`; no `REDIS_URL`, so the route itself
// delivers notifications directly — the queue path is driven through the
// service with a fake queue below.
const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'a-strong-password-123';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: getTestDatabaseUrl(),
  WEB_ORIGIN,
});

type App = Awaited<ReturnType<typeof buildApp>>;

const ORIGINAL_START = '2027-05-01T05:00:00.000Z';
const NEW_START = '2027-05-02T06:30:00.000Z';
const REASON = 'Обещают грозу — переносим на воскресенье.';

async function signUp(app: App): Promise<{ session: string; userId: string }> {
  const email = `${randomUUID()}@example.test`;
  const register = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  const token = new URL(
    register.json().verificationUrl,
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
  return {
    session: login.cookies.find((c) => c.name === 'session')!.value,
    userId: login.json().user.id as string,
  };
}

function call(
  app: App,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  url: string,
  session?: string,
  payload?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: { origin: WEB_ORIGIN },
    ...(session ? { cookies: { session } } : {}),
    ...(payload ? { payload } : {}),
  });
}

async function signUpOrganizer(app: App) {
  const organizer = await signUp(app);
  await call(app, 'POST', '/v1/organizers/me', organizer.session, {
    name: 'Гравийный клуб',
  });
  return organizer;
}

/**
 * A ride of a fresh organizer, published and then advanced through `steps`
 * (`open-registration`, `close-registration`, `start`, `finish`, `cancel`).
 * `publish: false` leaves it a draft.
 */
async function createRide(
  app: App,
  {
    steps = [],
    publish = true,
    participantLimit,
    startsAt = ORIGINAL_START,
  }: {
    steps?: string[];
    publish?: boolean;
    participantLimit?: number;
    startsAt?: string;
  } = {},
) {
  const organizer = await signUpOrganizer(app);
  const created = await call(app, 'POST', '/v1/rides', organizer.session, {
    title: 'Маршрут выходного дня',
    bicycleType: 'gravel',
    startsAt,
    startTimezone: 'Europe/Moscow',
  });
  expect(created.statusCode).toBe(201);
  const rideId = created.json().ride.id as string;
  if (participantLimit !== undefined) {
    const patched = await call(
      app,
      'PATCH',
      `/v1/rides/${rideId}`,
      organizer.session,
      { participantLimit },
    );
    expect(patched.statusCode).toBe(200);
  }
  if (publish) {
    for (const step of ['publish', ...steps]) {
      const res = await call(
        app,
        'POST',
        `/v1/rides/${rideId}/${step}`,
        organizer.session,
      );
      expect(res.statusCode, `${step}: ${res.body}`).toBe(200);
    }
  }
  return { organizer, rideId };
}

function reschedule(
  app: App,
  rideId: string,
  session: string | undefined,
  payload: Record<string, unknown> = { startsAt: NEW_START, reason: REASON },
) {
  return call(app, 'POST', `/v1/rides/${rideId}/reschedule`, session, payload);
}

async function inbox(app: App, session: string) {
  const res = await call(app, 'GET', '/v1/notifications/mine', session);
  expect(res.statusCode).toBe(200);
  return res.json().items as Array<{
    type: string;
    message: string | null;
    reschedule: {
      previousStartsAt: string;
      startsAt: string;
      startTimezone: string;
    } | null;
  }>;
}

/** A ride with one active registrant and one waitlisted rider (limit 1). */
async function fullRideWithWaitlist(app: App) {
  const ride = await createRide(app, {
    steps: ['open-registration'],
    participantLimit: 1,
  });
  const registrant = await signUp(app);
  const registered = await call(
    app,
    'POST',
    `/v1/rides/${ride.rideId}/register`,
    registrant.session,
  );
  expect(registered.statusCode).toBe(201);
  const waiting = await signUp(app);
  const queued = await call(
    app,
    'POST',
    `/v1/rides/${ride.rideId}/waitlist`,
    waiting.session,
  );
  expect(queued.statusCode).toBe(201);
  return { ...ride, registrant, waiting };
}

describe('POST /v1/rides/:id/reschedule (CR-190)', () => {
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

  describe('authorization', () => {
    it('rejects an anonymous request with 401 and leaves the start alone', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createRide(app);

      const res = await reschedule(app, rideId, undefined);

      expect(res.statusCode).toBe(401);
      const get = await call(app, 'GET', `/v1/rides/${rideId}`);
      expect(get.json().ride.startsAt).toBe(ORIGINAL_START);
      await app.close();
    });

    it('answers another organizer with 404 ride_not_found, never touching the ride', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createRide(app);
      const stranger = await signUpOrganizer(app);

      const res = await reschedule(app, rideId, stranger.session);

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('ride_not_found');
      const get = await call(app, 'GET', `/v1/rides/${rideId}`);
      expect(get.json().ride.startsAt).toBe(ORIGINAL_START);
      expect(get.json().rescheduleCount).toBe(0);
      await app.close();
    });

    it('answers a participant without an organizer profile with 404', async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await createRide(app, {
        steps: ['open-registration'],
      });
      const participant = await signUp(app);
      await call(
        app,
        'POST',
        `/v1/rides/${rideId}/register`,
        participant.session,
      );

      const res = await reschedule(app, rideId, participant.session);

      expect(res.statusCode).toBe(404);
      expect(res.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('rejects a cross-site request (mismatched Origin) with 403 before any change', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app);

      const res = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/reschedule`,
        headers: { origin: 'https://evil.example' },
        cookies: { session: organizer.session },
        payload: { startsAt: NEW_START, reason: REASON },
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().code).toBe('csrf_origin_mismatch');
      const get = await call(app, 'GET', `/v1/rides/${rideId}`);
      expect(get.json().ride.startsAt).toBe(ORIGINAL_START);
      await app.close();
    });
  });

  describe('lifecycle gate', () => {
    it('refuses a draft with 409 ride_is_draft (its start is edited with PATCH)', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app, { publish: false });

      const res = await reschedule(app, rideId, organizer.session);

      expect(res.statusCode).toBe(409);
      expect(res.json().code).toBe('ride_is_draft');
      await app.close();
    });

    it.each([
      ['started', ['open-registration', 'close-registration', 'start']],
      [
        'finished',
        ['open-registration', 'close-registration', 'start', 'finish'],
      ],
      ['cancelled', ['open-registration', 'cancel']],
    ])(
      'refuses a %s ride with 409 ride_not_reschedulable and keeps its start',
      async (_status, steps) => {
        const app = await buildApp(testEnv);
        const { organizer, rideId } = await createRide(app, { steps });

        const res = await reschedule(app, rideId, organizer.session);

        expect(res.statusCode).toBe(409);
        expect(res.json().code).toBe('ride_not_reschedulable');
        const [row] = await app.db
          .select({ startsAt: rides.startsAt })
          .from(rides)
          .where(eq(rides.id, rideId));
        expect(row?.startsAt.toISOString()).toBe(ORIGINAL_START);
        const updates = await app.db
          .select()
          .from(rideUpdates)
          .where(eq(rideUpdates.rideId, rideId));
        expect(updates).toHaveLength(0);
        await app.close();
      },
    );

    it.each([
      ['published', []],
      ['registration_open', ['open-registration']],
      ['registration_closed', ['open-registration', 'close-registration']],
    ])('moves a %s ride and keeps its status', async (status, steps) => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app, { steps });

      const res = await reschedule(app, rideId, organizer.session);

      expect(res.statusCode).toBe(200);
      expect(res.json().ride.startsAt).toBe(NEW_START);
      expect(res.json().ride.status).toBe(status);
      expect(res.json().ride.startTimezone).toBe('Europe/Moscow');
      await app.close();
    });

    it('moves an overdue ride (start passed, not started) to a future start', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app, {
        steps: ['open-registration', 'close-registration'],
      });
      // No API sets a past start on a published ride — age it directly.
      await app.db
        .update(rides)
        .set({ startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
        .where(eq(rides.id, rideId));

      const res = await reschedule(app, rideId, organizer.session);

      expect(res.statusCode).toBe(200);
      expect(res.json().ride.startsAt).toBe(NEW_START);
      await app.close();
    });
  });

  describe('the new start', () => {
    it('rejects a start that is not in the future with 422 reschedule_start_in_past', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app);

      const res = await reschedule(app, rideId, organizer.session, {
        startsAt: new Date(Date.now() - 60_000).toISOString(),
        reason: REASON,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('reschedule_start_in_past');
      await app.close();
    });

    it('rejects the current start with 422 reschedule_start_unchanged', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app);

      const res = await reschedule(app, rideId, organizer.session, {
        // Same instant with explicit milliseconds dropped — compared as instants.
        startsAt: '2027-05-01T05:00:00Z',
        reason: REASON,
      });

      expect(res.statusCode).toBe(422);
      expect(res.json().code).toBe('reschedule_start_unchanged');
      await app.close();
    });

    it.each([
      ['a missing reason', { startsAt: NEW_START }],
      ['a blank reason', { startsAt: NEW_START, reason: '   ' }],
      [
        'a reason over 500 characters',
        { startsAt: NEW_START, reason: 'а'.repeat(501) },
      ],
      ['a malformed start', { startsAt: '2027-05-02 06:30', reason: REASON }],
      ['a missing start', { reason: REASON }],
    ])('rejects %s with 400 validation_error', async (_case, payload) => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app);

      const res = await reschedule(app, rideId, organizer.session, payload);

      expect(res.statusCode).toBe(400);
      expect(res.json().code).toBe('validation_error');
      await app.close();
    });
  });

  describe('effects', () => {
    it('records who/when/from/to/why atomically with the new start', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app, {
        steps: ['open-registration'],
      });

      const res = await reschedule(app, rideId, organizer.session, {
        startsAt: NEW_START,
        reason: `  ${REASON}  `,
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.ride.updatedBy).toBe(organizer.userId);
      expect(body.rideUpdate).toMatchObject({
        rideId,
        message: REASON,
        reschedule: { previousStartsAt: ORIGINAL_START, startsAt: NEW_START },
      });
      const [row] = await app.db
        .select()
        .from(rideUpdates)
        .where(eq(rideUpdates.id, body.rideUpdate.id));
      expect(row?.updatedBy).toBe(organizer.userId);
      expect(row?.previousStartsAt?.toISOString()).toBe(ORIGINAL_START);
      expect(row?.newStartsAt?.toISOString()).toBe(NEW_START);

      // It is part of the ride's history, newest first.
      const history = await call(
        app,
        'GET',
        `/v1/rides/${rideId}/updates`,
        organizer.session,
      );
      expect(history.json().items[0]).toMatchObject({
        message: REASON,
        reschedule: { previousStartsAt: ORIGINAL_START, startsAt: NEW_START },
      });
      await app.close();
    });

    it('exposes the latest move and a growing count on GET /v1/rides/:id', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app, {
        steps: ['open-registration'],
      });

      const before = await call(app, 'GET', `/v1/rides/${rideId}`);
      expect(before.json()).toMatchObject({
        rescheduleCount: 0,
        lastReschedule: null,
      });

      await reschedule(app, rideId, organizer.session);
      const third = '2027-05-09T06:00:00.000Z';
      await reschedule(app, rideId, organizer.session, {
        startsAt: third,
        reason: 'Ещё неделя — ремонт моста на маршруте.',
      });

      // Public, like the ride itself.
      const after = await call(app, 'GET', `/v1/rides/${rideId}`);
      expect(after.json().ride.startsAt).toBe(third);
      expect(after.json().rescheduleCount).toBe(2);
      expect(after.json().lastReschedule).toMatchObject({
        previousStartsAt: NEW_START,
        startsAt: third,
        reason: 'Ещё неделя — ремонт моста на маршруте.',
      });
      await app.close();
    });

    it('notifies every active registrant and the waitlist with from → to and the reason', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId, registrant, waiting } =
        await fullRideWithWaitlist(app);
      const bystander = await signUp(app);

      const res = await reschedule(app, rideId, organizer.session);
      expect(res.statusCode).toBe(200);

      for (const recipient of [registrant, waiting]) {
        const items = await inbox(app, recipient.session);
        const moved = items.find((item) => item.reschedule !== null);
        expect(moved).toMatchObject({
          type: 'ride_update',
          message: REASON,
          reschedule: {
            previousStartsAt: ORIGINAL_START,
            startsAt: NEW_START,
            startTimezone: 'Europe/Moscow',
          },
        });
      }
      expect(await inbox(app, bystander.session)).toEqual([]);
      expect(await inbox(app, organizer.session)).toEqual([]);
      await app.close();
    });

    it('keeps registrations and the queue; a rider who cannot make it cancels as before and the waitlist moves up', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId, registrant, waiting } =
        await fullRideWithWaitlist(app);

      await reschedule(app, rideId, organizer.session);
      const forRegistrant = await call(
        app,
        'GET',
        `/v1/rides/${rideId}`,
        registrant.session,
      );
      expect(forRegistrant.json().viewerRegistration).not.toBeNull();
      expect(forRegistrant.json().waitlistCount).toBe(1);

      const cancelled = await call(
        app,
        'DELETE',
        `/v1/rides/${rideId}/register`,
        registrant.session,
      );
      expect(cancelled.statusCode).toBe(204);
      const forWaiting = await call(
        app,
        'GET',
        `/v1/rides/${rideId}`,
        waiting.session,
      );
      expect(forWaiting.json().viewerRegistration).not.toBeNull();
      expect(forWaiting.json().viewerWaitlistEntry).toBeNull();
      await app.close();
    });
  });

  describe('notification fan-out (service level, fake queue)', () => {
    const logger = () => ({ error: vi.fn() });

    it('enqueues one ride_rescheduled job only after the reschedule has committed', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app, {
        steps: ['open-registration'],
      });
      // Read through the pool, outside the service's transaction: the row
      // must already be visible when the job is enqueued.
      const seenAtEnqueue: Array<string | undefined> = [];
      const queue: NotificationQueue = {
        add: vi.fn(async () => {
          const [row] = await app.db
            .select({ startsAt: rides.startsAt })
            .from(rides)
            .where(eq(rides.id, rideId));
          seenAtEnqueue.push(row?.startsAt.toISOString());
        }),
      };

      const result = await rescheduleRide(
        app.db,
        logger(),
        queue,
        organizer.userId,
        rideId,
        { startsAt: NEW_START, reason: REASON },
      );

      expect(queue.add).toHaveBeenCalledTimes(1);
      expect(queue.add).toHaveBeenCalledWith('ride_rescheduled', {
        rideId,
        rideUpdateId: result.rideUpdate.id,
      });
      expect(seenAtEnqueue).toEqual([NEW_START]);
      await app.close();
    });

    it("the worker's ride_rescheduled job notifies registrants and the waitlist", async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId, registrant, waiting } =
        await fullRideWithWaitlist(app);
      const queue: NotificationQueue = { add: vi.fn(async () => {}) };

      const result = await rescheduleRide(
        app.db,
        logger(),
        queue,
        organizer.userId,
        rideId,
        { startsAt: NEW_START, reason: REASON },
      );
      // Enqueued, not delivered: no reschedule in the inbox until the job runs.
      const moved = async (session: string) =>
        (await inbox(app, session)).filter((item) => item.reschedule !== null);
      expect(await moved(registrant.session)).toEqual([]);

      await processNotificationJob(app.db, null, 'ride_rescheduled', {
        rideId,
        rideUpdateId: result.rideUpdate.id,
      });

      for (const recipient of [registrant, waiting]) {
        expect(await moved(recipient.session)).toEqual([
          expect.objectContaining({
            message: REASON,
            reschedule: expect.objectContaining({ startsAt: NEW_START }),
          }),
        ]);
      }
      await app.close();
    });

    it('keeps the reschedule when the enqueue fails (logged, not delivered twice)', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId, registrant } = await fullRideWithWaitlist(app);
      const log = logger();
      const queue: NotificationQueue = {
        add: vi.fn().mockRejectedValue(new Error('enqueue timed out')),
      };

      const result = await rescheduleRide(
        app.db,
        log,
        queue,
        organizer.userId,
        rideId,
        { startsAt: NEW_START, reason: REASON },
      );

      expect(result.ride.startsAt).toBe(NEW_START);
      expect(log.error).toHaveBeenCalledTimes(1);
      const [row] = await app.db
        .select({ startsAt: rides.startsAt })
        .from(rides)
        .where(eq(rides.id, rideId));
      expect(row?.startsAt.toISOString()).toBe(NEW_START);
      // The job may still have reached Redis — no direct copy (KI-071).
      expect(await inbox(app, registrant.session)).not.toContainEqual(
        expect.objectContaining({ type: 'ride_update' }),
      );
      await app.close();
    });

    it('delivers directly to registrants and the waitlist when the queue is provably down', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId, registrant, waiting } =
        await fullRideWithWaitlist(app);
      const queue: NotificationQueue = {
        add: vi
          .fn()
          .mockRejectedValue(
            new NotificationQueueUnavailableError('Redis not connected'),
          ),
      };

      const result = await rescheduleRide(
        app.db,
        logger(),
        queue,
        organizer.userId,
        rideId,
        { startsAt: NEW_START, reason: REASON },
      );

      const rows = await app.db
        .select({ userId: notifications.userId })
        .from(notifications)
        .where(
          and(
            eq(notifications.rideId, rideId),
            eq(notifications.rideUpdateId, result.rideUpdate.id),
          ),
        );
      expect(rows.map((row) => row.userId).sort()).toEqual(
        [registrant.userId, waiting.userId].sort(),
      );
      await app.close();
    });

    it('keeps the reschedule when even the direct delivery fails', async () => {
      const app = await buildApp(testEnv);
      const { organizer, rideId } = await createRide(app, {
        steps: ['open-registration'],
      });
      const log = logger();
      const queue: NotificationQueue = {
        add: vi
          .fn()
          .mockRejectedValue(
            new NotificationQueueUnavailableError('Redis not connected'),
          ),
      };
      // The fan-out reads recipients through `db.select`; the reschedule's own
      // transaction does not, so failing only the pool's select hits just the
      // side effect.
      const db = Object.create(app.db) as typeof app.db;
      let failSelect = false;
      db.select = ((...args: Parameters<typeof app.db.select>) => {
        if (failSelect) throw new Error('db down');
        return app.db.select(...args);
      }) as typeof app.db.select;
      db.transaction = (async (
        ...args: Parameters<typeof app.db.transaction>
      ) => {
        const out = await app.db.transaction(...args);
        failSelect = true;
        return out;
      }) as typeof app.db.transaction;

      const result = await rescheduleRide(
        db,
        log,
        queue,
        organizer.userId,
        rideId,
        { startsAt: NEW_START, reason: REASON },
      );

      expect(result.ride.startsAt).toBe(NEW_START);
      expect(log.error).toHaveBeenCalledTimes(1);
      const [row] = await app.db
        .select({ startsAt: rides.startsAt })
        .from(rides)
        .where(eq(rides.id, rideId));
      expect(row?.startsAt.toISOString()).toBe(NEW_START);
      await app.close();
    });
  });
});
