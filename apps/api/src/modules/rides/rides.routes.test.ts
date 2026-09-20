import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { organizerProfiles, rides, users } from 'db/schema';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// Same rationale as `organizers.routes.test.ts`: a real Postgres, `DELETE FROM users`
// (cascades to `organizer_profiles`; `rides.organizer_id` references
// `organizer_profiles` with `ON DELETE RESTRICT`, so this file's own `beforeEach`
// clears `rides` first, then `organizer_profiles`/`users` — see below).
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

  describe('GET /v1/rides (public discovery, CR-024)', () => {
    it('returns an empty page when there are no rides at all, no cookie needed', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({ method: 'GET', url: '/v1/rides' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ items: [], nextCursor: null });

      await app.close();
    });

    it('never includes a draft ride, even with no filter applied', async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });

      const response = await app.inject({ method: 'GET', url: '/v1/rides' });

      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([]);

      await app.close();
    });

    it('includes every non-draft status, each with the organizer summary cross-checked against the DB, and excludes a draft', async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const [organizerProfile] = await app.db
        .select({ id: organizerProfiles.id })
        .from(organizerProfiles)
        .where(eq(organizerProfiles.userId, owner.userId));

      async function createRide(title: string) {
        const created = await app.inject({
          method: 'POST',
          url: '/v1/rides',
          headers: { origin: WEB_ORIGIN },
          cookies: { session: owner.rawToken },
          payload: { ...VALID_PAYLOAD, title },
        });
        return created.json().ride.id as string;
      }
      async function transition(rideId: string, action: string) {
        await app.inject({
          method: 'POST',
          url: `/v1/rides/${rideId}/${action}`,
          headers: { origin: WEB_ORIGIN },
          cookies: { session: owner.rawToken },
        });
      }

      const draftId = await createRide('Черновик');

      const publishedId = await createRide('Опубликован');
      await transition(publishedId, 'publish');

      const openId = await createRide('Регистрация открыта');
      await transition(openId, 'publish');
      await transition(openId, 'open-registration');

      const closedId = await createRide('Регистрация закрыта');
      await transition(closedId, 'publish');
      await transition(closedId, 'open-registration');
      await transition(closedId, 'close-registration');

      const startedId = await createRide('Начался');
      await transition(startedId, 'publish');
      await transition(startedId, 'open-registration');
      await transition(startedId, 'close-registration');
      await transition(startedId, 'start');

      const finishedId = await createRide('Завершён');
      await transition(finishedId, 'publish');
      await transition(finishedId, 'open-registration');
      await transition(finishedId, 'close-registration');
      await transition(finishedId, 'start');
      await transition(finishedId, 'finish');

      const cancelledId = await createRide('Отменён');
      await transition(cancelledId, 'publish');
      await transition(cancelledId, 'cancel');

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides?limit=50',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      const byId = new Map(
        (
          body.items as Array<{
            id: string;
            status: string;
            organizer: unknown;
          }>
        ).map((item) => [item.id, item]),
      );

      expect(byId.has(draftId)).toBe(false);
      expect(byId.get(publishedId)?.status).toBe('published');
      expect(byId.get(openId)?.status).toBe('registration_open');
      expect(byId.get(closedId)?.status).toBe('registration_closed');
      expect(byId.get(startedId)?.status).toBe('started');
      expect(byId.get(finishedId)?.status).toBe('finished');
      expect(byId.get(cancelledId)?.status).toBe('cancelled');
      expect(byId.get(publishedId)?.organizer).toEqual({
        id: organizerProfile!.id,
        name: 'Гравийный клуб',
        avatarUrl: null,
        rating: null,
        reviewCount: 0,
      });

      await app.close();
    });

    it('paginates soonest-first and rejects a malformed cursor with 400 invalid_cursor', async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });

      async function createPublished(title: string, startsAt: string) {
        const created = await app.inject({
          method: 'POST',
          url: '/v1/rides',
          headers: { origin: WEB_ORIGIN },
          cookies: { session: owner.rawToken },
          payload: { ...VALID_PAYLOAD, title, startsAt },
        });
        const rideId = created.json().ride.id as string;
        await app.inject({
          method: 'POST',
          url: `/v1/rides/${rideId}/publish`,
          headers: { origin: WEB_ORIGIN },
          cookies: { session: owner.rawToken },
        });
        return rideId;
      }

      // Created out of chronological order on purpose — the sooner one must still
      // come first (CR-025: `startsAt asc`, not creation order).
      const sooner = await createPublished('Скоро', '2027-05-01T05:00:00.000Z');
      const later = await createPublished('Позже', '2027-06-01T05:00:00.000Z');

      const page1 = await app.inject({
        method: 'GET',
        url: '/v1/rides?limit=1',
      });
      expect(page1.statusCode).toBe(200);
      const body1 = page1.json();
      expect(body1.items).toHaveLength(1);
      expect(body1.items[0].id).toBe(sooner);
      expect(body1.nextCursor).not.toBeNull();

      const page2 = await app.inject({
        method: 'GET',
        url: `/v1/rides?limit=1&cursor=${encodeURIComponent(body1.nextCursor)}`,
      });
      expect(page2.statusCode).toBe(200);
      const body2 = page2.json();
      expect(body2.items).toHaveLength(1);
      expect(body2.items[0].id).toBe(later);
      expect(body2.nextCursor).toBeNull();

      const malformed = await app.inject({
        method: 'GET',
        url: '/v1/rides?cursor=not-a-valid-cursor',
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json().code).toBe('invalid_cursor');

      await app.close();
    });

    it('excludes a published ride whose startsAt has already passed (CR-025, resolves KI-029)', async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });

      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: { ...VALID_PAYLOAD, startsAt: '2020-01-01T05:00:00.000Z' },
      });
      const rideId = created.json().ride.id as string;
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
      });

      const response = await app.inject({ method: 'GET', url: '/v1/rides' });

      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([]);

      await app.close();
    });

    it('filters by bicycleType when provided, and returns every type when omitted', async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });

      async function createPublished(bicycleType: string) {
        const created = await app.inject({
          method: 'POST',
          url: '/v1/rides',
          headers: { origin: WEB_ORIGIN },
          cookies: { session: owner.rawToken },
          payload: { ...VALID_PAYLOAD, bicycleType },
        });
        const rideId = created.json().ride.id as string;
        await app.inject({
          method: 'POST',
          url: `/v1/rides/${rideId}/publish`,
          headers: { origin: WEB_ORIGIN },
          cookies: { session: owner.rawToken },
        });
        return rideId;
      }

      const roadId = await createPublished('road');
      const gravelId = await createPublished('gravel');

      const filtered = await app.inject({
        method: 'GET',
        url: '/v1/rides?bicycleType=road',
      });
      expect(filtered.statusCode).toBe(200);
      const filteredIds = (filtered.json().items as Array<{ id: string }>).map(
        (item) => item.id,
      );
      expect(filteredIds).toContain(roadId);
      expect(filteredIds).not.toContain(gravelId);

      const unfiltered = await app.inject({ method: 'GET', url: '/v1/rides' });
      const unfilteredIds = (
        unfiltered.json().items as Array<{ id: string }>
      ).map((item) => item.id);
      expect(unfilteredIds).toContain(roadId);
      expect(unfilteredIds).toContain(gravelId);

      await app.close();
    });

    it('rejects a partial bbox (CR-026) with 400 validation_error', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides?bboxNorth=56&bboxSouth=55',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('filters by bbox (CR-026, ADR-014) and excludes a ride with no coordinates', async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });

      async function createPublishedAt(
        title: string,
        coords: { startLat: number; startLng: number } | null,
      ) {
        const created = await app.inject({
          method: 'POST',
          url: '/v1/rides',
          headers: { origin: WEB_ORIGIN },
          cookies: { session: owner.rawToken },
          payload: { ...VALID_PAYLOAD, title },
        });
        const rideId = created.json().ride.id as string;
        if (coords) {
          await app.inject({
            method: 'PATCH',
            url: `/v1/rides/${rideId}`,
            headers: { origin: WEB_ORIGIN },
            cookies: { session: owner.rawToken },
            payload: coords,
          });
        }
        await app.inject({
          method: 'POST',
          url: `/v1/rides/${rideId}/publish`,
          headers: { origin: WEB_ORIGIN },
          cookies: { session: owner.rawToken },
        });
        return rideId;
      }

      // Moscow — inside the bbox below.
      const insideId = await createPublishedAt('Москва', {
        startLat: 55.751244,
        startLng: 37.618423,
      });
      // Novosibirsk — well outside the bbox below.
      const outsideId = await createPublishedAt('Новосибирск', {
        startLat: 55.0084,
        startLng: 82.9357,
      });
      // No coordinates at all — must never appear in a bbox-filtered result.
      const noCoordsId = await createPublishedAt('Без координат', null);

      const filtered = await app.inject({
        method: 'GET',
        url: '/v1/rides?bboxNorth=56&bboxSouth=55&bboxEast=38&bboxWest=37',
      });
      expect(filtered.statusCode).toBe(200);
      const filteredIds = (filtered.json().items as Array<{ id: string }>).map(
        (item) => item.id,
      );
      expect(filteredIds).toContain(insideId);
      expect(filteredIds).not.toContain(outsideId);
      expect(filteredIds).not.toContain(noCoordsId);

      // Unfiltered: the coordinate-less ride still appears (resilience: viewable
      // without geocoded coordinates).
      const unfiltered = await app.inject({ method: 'GET', url: '/v1/rides' });
      const unfilteredIds = (
        unfiltered.json().items as Array<{ id: string }>
      ).map((item) => item.id);
      expect(unfilteredIds).toContain(noCoordsId);

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
    // CR-023 ("Ride detail"): extended from an owner-only endpoint to also serve any
    // other viewer (unauthenticated or a non-owner) once the ride has left `draft` —
    // `.claude/context/current-task.md`'s "Investigation before deciding scope".

    it('rejects a malformed id with 400 validation_error (no cookie)', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides/not-a-uuid',
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('returns 404 ride_not_found for a non-existent id (no cookie)', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/rides/00000000-0000-0000-0000-000000000000',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it('returns 404 ride_not_found for a draft ride with no cookie', async () => {
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

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it('returns 404 ride_not_found for a draft ride viewed by another organizer', async () => {
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

    it("returns the caller's own draft ride, with the organizer summary", async () => {
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
      expect(response.json().organizer.name).toBe('Гравийный клуб');
      // CR-097 (KI-023 remainder): additive field, null until an avatar is
      // uploaded via `POST /v1/organizers/me/avatar`.
      expect(response.json().organizer.avatarUrl).toBeNull();
      // CR-030 ("Stops"): additive field, empty until a stop is created.
      expect(response.json().stops).toEqual([]);

      await app.close();
    });

    it('returns a published ride with no cookie at all, cross-checked against the DB', async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, {
        verifyEmail: true,
        withOrganizerProfile: true,
      });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });
      const rideId = created.json().ride.id;
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ride.status).toBe('published');
      expect(body.organizer).toEqual({
        id: (
          await app.db
            .select({ id: organizerProfiles.id })
            .from(organizerProfiles)
            .where(eq(organizerProfiles.userId, owner.userId))
        )[0]!.id,
        name: 'Гравийный клуб',
        avatarUrl: null,
        rating: null,
        reviewCount: 0,
      });

      const [row] = await app.db
        .select()
        .from(rides)
        .where(eq(rides.id, rideId));
      expect(row!.status).toBe('published');

      await app.close();
    });

    it("returns a published ride to a different organizer's session too", async () => {
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
      const rideId = created.json().ride.id;
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
        cookies: { session: stranger.rawToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().ride.status).toBe('published');

      await app.close();
    });

    it('returns a cancelled ride with no cookie (still "published+")', async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });
      const rideId = created.json().ride.id;
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
      });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cancel`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().ride.status).toBe('cancelled');

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
      // Flips the status directly (rather than going through CR-019's own
      // `POST /:id/publish`) to exercise this gate in isolation, independent of
      // publish's own checks.
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
          startLat: 55.751244,
          startLng: 37.618423,
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
      expect(body.ride.startLat).toBe(55.751244);
      expect(body.ride.startLng).toBe(37.618423);
      expect(body.ride.updatedBy).toBe(userId);

      // Verified via a direct DB read, not just the HTTP response.
      const [row] = await app.db
        .select()
        .from(rides)
        .where(eq(rides.id, created.json().ride.id));
      expect(row?.title).toBe('Обновлённое название');
      expect(row?.participantLimit).toBe(30);
      expect(row?.startLat).toBe(55.751244);
      expect(row?.startLng).toBe(37.618423);

      await app.close();
    });

    it('rejects startLat without startLng (CR-026) with 400 validation_error', async () => {
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
        payload: { startLat: 55.751244 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('validation_error');

      await app.close();
    });

    it('rejects an out-of-range startLat (CR-026) with 400 validation_error', async () => {
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
        payload: { startLat: 200, startLng: 37.618423 },
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

  describe('POST /v1/rides/:id/publish', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/publish`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('returns 404 ride_not_found for a non-existent id', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it("returns 404 ride_not_found for another organizer's ride", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });

      const stranger = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it('rejects publishing with an unverified email with 403', async () => {
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
      // `registerAndLogin` verifies the email by default (needed for
      // `withOrganizerProfile` to succeed, since organizer profile creation has its
      // own `emailVerified` gate) — flip it back off directly to exercise publish's
      // own gate in isolation.
      await app.db
        .update(users)
        .set({ emailVerified: false })
        .where(eq(users.id, userId));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('email_verification_required');

      await app.close();
    });

    it('rejects publishing a non-draft ride with 409 ride_not_publishable', async () => {
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
      await app.db
        .update(rides)
        .set({ status: 'published' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_publishable');

      await app.close();
    });

    it('publishes a draft ride and returns it with status published', async () => {
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
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ride.status).toBe('published');
      expect(body.ride.updatedBy).toBe(userId);

      // Verified via a direct DB read, not just the HTTP response.
      const [row] = await app.db
        .select()
        .from(rides)
        .where(eq(rides.id, created.json().ride.id));
      expect(row?.status).toBe('published');
      expect(row?.updatedBy).toBe(userId);

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
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/publish`,
        headers: { origin: 'https://evil.example' },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');

      await app.close();
    });
  });

  describe('POST /v1/rides/:id/open-registration', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/open-registration`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('returns 404 ride_not_found for a non-existent id', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/open-registration`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it("returns 404 ride_not_found for another organizer's ride", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });
      await app.db
        .update(rides)
        .set({ status: 'published' })
        .where(eq(rides.id, created.json().ride.id));

      const stranger = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/open-registration`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it('rejects opening registration on a draft ride with 409 ride_registration_not_openable', async () => {
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
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/open-registration`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_registration_not_openable');

      await app.close();
    });

    it('opens registration on a published ride and returns it with status registration_open', async () => {
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
      await app.db
        .update(rides)
        .set({ status: 'published' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/open-registration`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ride.status).toBe('registration_open');
      expect(body.ride.updatedBy).toBe(userId);

      const [row] = await app.db
        .select()
        .from(rides)
        .where(eq(rides.id, created.json().ride.id));
      expect(row?.status).toBe('registration_open');
      expect(row?.updatedBy).toBe(userId);

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
      await app.db
        .update(rides)
        .set({ status: 'published' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/open-registration`,
        headers: { origin: 'https://evil.example' },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');

      await app.close();
    });
  });

  describe('POST /v1/rides/:id/close-registration', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/close-registration`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('returns 404 ride_not_found for a non-existent id', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/close-registration`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it("returns 404 ride_not_found for another organizer's ride", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });
      await app.db
        .update(rides)
        .set({ status: 'registration_open' })
        .where(eq(rides.id, created.json().ride.id));

      const stranger = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/close-registration`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it('rejects closing registration on a published ride with 409 ride_registration_not_closable', async () => {
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
      await app.db
        .update(rides)
        .set({ status: 'published' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/close-registration`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_registration_not_closable');

      await app.close();
    });

    it('closes registration on a registration_open ride and returns it with status registration_closed', async () => {
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
      await app.db
        .update(rides)
        .set({ status: 'registration_open' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/close-registration`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ride.status).toBe('registration_closed');
      expect(body.ride.updatedBy).toBe(userId);

      const [row] = await app.db
        .select()
        .from(rides)
        .where(eq(rides.id, created.json().ride.id));
      expect(row?.status).toBe('registration_closed');
      expect(row?.updatedBy).toBe(userId);

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
      await app.db
        .update(rides)
        .set({ status: 'registration_open' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/close-registration`,
        headers: { origin: 'https://evil.example' },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');

      await app.close();
    });
  });

  describe('POST /v1/rides/:id/cancel', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/cancel`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('returns 404 ride_not_found for a non-existent id', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/cancel`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it("returns 404 ride_not_found for another organizer's ride", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });
      await app.db
        .update(rides)
        .set({ status: 'published' })
        .where(eq(rides.id, created.json().ride.id));

      const stranger = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/cancel`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it('rejects cancelling a draft ride with 409 ride_not_cancellable', async () => {
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
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/cancel`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_cancellable');

      await app.close();
    });

    // CR-090/CR-022: `docs/product.md`'s Cancellation line names only
    // `published`/`registration_open`/`registration_closed` — `started` was
    // deliberately left out of `CANCELLABLE_STATUSES` when this endpoint was built.
    // Reconfirmed here now that `started` is actually reachable, not just assumed.
    it('rejects cancelling a started ride with 409 ride_not_cancellable', async () => {
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
      await app.db
        .update(rides)
        .set({ status: 'started' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/cancel`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_cancellable');

      await app.close();
    });

    // `docs/product.md`'s Lifecycle: all three of `published`/`registration_open`/
    // `registration_closed` are valid cancellation sources, unlike every other
    // transition's single valid source status.
    it.each(['published', 'registration_open', 'registration_closed'] as const)(
      'cancels a %s ride and returns it with status cancelled',
      async (sourceStatus) => {
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
        await app.db
          .update(rides)
          .set({ status: sourceStatus })
          .where(eq(rides.id, created.json().ride.id));

        const response = await app.inject({
          method: 'POST',
          url: `/v1/rides/${created.json().ride.id}/cancel`,
          headers: { origin: WEB_ORIGIN },
          cookies: { session: rawToken },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.ride.status).toBe('cancelled');
        expect(body.ride.updatedBy).toBe(userId);

        const [row] = await app.db
          .select()
          .from(rides)
          .where(eq(rides.id, created.json().ride.id));
        expect(row?.status).toBe('cancelled');
        expect(row?.updatedBy).toBe(userId);

        await app.close();
      },
    );

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
      await app.db
        .update(rides)
        .set({ status: 'published' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/cancel`,
        headers: { origin: 'https://evil.example' },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');

      await app.close();
    });
  });

  describe('POST /v1/rides/:id/start', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/start`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('returns 404 ride_not_found for a non-existent id', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/start`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it("returns 404 ride_not_found for another organizer's ride", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });
      await app.db
        .update(rides)
        .set({ status: 'registration_closed' })
        .where(eq(rides.id, created.json().ride.id));

      const stranger = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/start`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it('rejects starting a published ride with 409 ride_not_startable', async () => {
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
      await app.db
        .update(rides)
        .set({ status: 'published' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/start`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_startable');

      await app.close();
    });

    it('starts a registration_closed ride and returns it with status started', async () => {
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
      await app.db
        .update(rides)
        .set({ status: 'registration_closed' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/start`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ride.status).toBe('started');
      expect(body.ride.updatedBy).toBe(userId);

      const [row] = await app.db
        .select()
        .from(rides)
        .where(eq(rides.id, created.json().ride.id));
      expect(row?.status).toBe('started');
      expect(row?.updatedBy).toBe(userId);

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
      await app.db
        .update(rides)
        .set({ status: 'registration_closed' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/start`,
        headers: { origin: 'https://evil.example' },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');

      await app.close();
    });
  });

  describe('POST /v1/rides/:id/finish', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/finish`,
        headers: { origin: WEB_ORIGIN },
      });

      expect(response.statusCode).toBe(401);

      await app.close();
    });

    it('returns 404 ride_not_found for a non-existent id', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/finish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it("returns 404 ride_not_found for another organizer's ride", async () => {
      const app = await buildApp(testEnv);
      const owner = await registerAndLogin(app, { withOrganizerProfile: true });
      const created = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: owner.rawToken },
        payload: VALID_PAYLOAD,
      });
      await app.db
        .update(rides)
        .set({ status: 'started' })
        .where(eq(rides.id, created.json().ride.id));

      const stranger = await registerAndLogin(app, {
        withOrganizerProfile: true,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/finish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: stranger.rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');

      await app.close();
    });

    it('rejects finishing a registration_closed ride with 409 ride_not_finishable', async () => {
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
      await app.db
        .update(rides)
        .set({ status: 'registration_closed' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/finish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_finishable');

      await app.close();
    });

    it('finishes a started ride and returns it with status finished', async () => {
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
      await app.db
        .update(rides)
        .set({ status: 'started' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/finish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.ride.status).toBe('finished');
      expect(body.ride.updatedBy).toBe(userId);

      const [row] = await app.db
        .select()
        .from(rides)
        .where(eq(rides.id, created.json().ride.id));
      expect(row?.status).toBe('finished');
      expect(row?.updatedBy).toBe(userId);

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
      await app.db
        .update(rides)
        .set({ status: 'started' })
        .where(eq(rides.id, created.json().ride.id));

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${created.json().ride.id}/finish`,
        headers: { origin: 'https://evil.example' },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().code).toBe('csrf_origin_mismatch');

      await app.close();
    });
  });
});
