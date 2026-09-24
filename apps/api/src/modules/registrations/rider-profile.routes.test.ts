import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-126: `resolveRiderAccess`'s three visibility tiers, plus the profile/avatar
// routes it gates. Same S3-mocking technique as `users/avatar.routes.test.ts` — no
// live MinIO needed.
const sendMock = vi.fn();
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  class MockS3Client {
    send(...args: unknown[]) {
      return sendMock(...args);
    }
  }
  return { ...actual, S3Client: MockS3Client };
});

const { buildApp } = await import('../../app.js');
const { loadEnv } = await import('../../env.js');

const DATABASE_URL = getTestDatabaseUrl();
const WEB_ORIGIN = 'http://localhost:3000';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL,
  WEB_ORIGIN,
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY_ID: 'test-access-key',
  S3_SECRET_ACCESS_KEY: 'test-secret-key',
  S3_BUCKET: 'coffee-ride-test',
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
  // Organizer actions (creating an organizer profile, publishing a ride) require a
  // verified email (`.claude/rules/security.md`) — every helper user here verifies
  // up front so `createOpenRide` can always act as an organizer.
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
  return { rawToken: login.cookies.find((c) => c.name === 'session')!.value };
}

async function createOpenRide(app: App) {
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
  for (const action of ['publish', 'open-registration']) {
    await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/${action}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
    });
  }
  return { token, rideId };
}

function register(app: App, token: string, rideId: string) {
  return app.inject({
    method: 'POST',
    url: `/v1/rides/${rideId}/register`,
    headers: { origin: WEB_ORIGIN },
    cookies: { session: token },
  });
}

async function getRegistrationId(
  app: App,
  rideId: string,
  viewerToken: string,
) {
  const riders = await app.inject({
    method: 'GET',
    url: `/v1/rides/${rideId}/riders`,
    cookies: { session: viewerToken },
  });
  return riders.json().items[0].registrationId as string;
}

async function setProfileVisibility(
  app: App,
  token: string,
  visibility: 'closed' | 'co_participants' | 'open',
) {
  await app.inject({
    method: 'PATCH',
    url: '/v1/users/me',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: token },
    payload: { profileVisibility: visibility },
  });
}

describe('GET /v1/rides/:id/riders/:registrationId/profile', () => {
  beforeEach(async () => {
    sendMock.mockReset();
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  it('403 riders_hidden when the organizer turned off the riders list', async () => {
    const app = await buildApp(testEnv);
    // `participantsVisible` is draft-only editable (CR-125) — set it before
    // publishing, unlike `createOpenRide`'s helper flow.
    const { rawToken: token } = await registerAndLoginUser(app);
    await app.inject({
      method: 'POST',
      url: '/v1/organizers/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: { name: 'Гравийный клуб' },
    });
    const draft = await app.inject({
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
    const rideId = draft.json().ride.id as string;
    await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}`,
      headers: { origin: WEB_ORIGIN },
      cookies: { session: token },
      payload: { participantsVisible: false },
    });
    for (const action of ['publish', 'open-registration']) {
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/${action}`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: token },
      });
    }

    const rider = await registerAndLoginUser(app);
    await register(app, rider.rawToken, rideId);
    // `/participants` is organizer-only and unaffected by `participantsVisible`
    // (that flag only gates the public `/riders` list) — the one way left to learn
    // the registration id once the riders list itself is hidden.
    const participants = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/participants`,
      cookies: { session: token },
    });
    const registrationId = participants.json().items[0].id as string;

    const viewer = await registerAndLoginUser(app);
    const response = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/profile`,
      cookies: { session: viewer.rawToken },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('riders_hidden');
    await app.close();
  });

  it('404 rider_not_found for a registrationId from a different ride', async () => {
    const app = await buildApp(testEnv);
    const { rideId: rideA } = await createOpenRide(app);
    const { token: tokenB, rideId: rideB } = await createOpenRide(app);
    const rider = await registerAndLoginUser(app);
    await register(app, rider.rawToken, rideA);
    const registrationId = await getRegistrationId(app, rideA, tokenB);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideB}/riders/${registrationId}/profile`,
      cookies: { session: tokenB },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe('rider_not_found');
    await app.close();
  });

  it('closed: only the owner sees it, not an unrelated signed-in viewer or a co-participant', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOpenRide(app);
    const rider = await registerAndLoginUser(app);
    await register(app, rider.rawToken, rideId);
    await setProfileVisibility(app, rider.rawToken, 'closed');
    const registrationId = await getRegistrationId(app, rideId, token);

    const self = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/profile`,
      cookies: { session: rider.rawToken },
    });
    expect(self.statusCode).toBe(200);

    const coParticipant = await registerAndLoginUser(app);
    await register(app, coParticipant.rawToken, rideId);
    const denied = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/profile`,
      cookies: { session: coParticipant.rawToken },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe('profile_private');
    await app.close();
  });

  it('closed: the ride’s organizer can still see it', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOpenRide(app);
    const rider = await registerAndLoginUser(app);
    await register(app, rider.rawToken, rideId);
    await setProfileVisibility(app, rider.rawToken, 'closed');
    const registrationId = await getRegistrationId(app, rideId, token);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/profile`,
      cookies: { session: token },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('co_participants (default): a fellow rider of the same ride is granted, an unrelated signed-in user is not', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOpenRide(app);
    const rider = await registerAndLoginUser(app);
    await register(app, rider.rawToken, rideId);
    const registrationId = await getRegistrationId(app, rideId, token);

    const coParticipant = await registerAndLoginUser(app);
    await register(app, coParticipant.rawToken, rideId);
    const granted = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/profile`,
      cookies: { session: coParticipant.rawToken },
    });
    expect(granted.statusCode).toBe(200);

    const stranger = await registerAndLoginUser(app);
    const denied = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/profile`,
      cookies: { session: stranger.rawToken },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().code).toBe('profile_private');
    await app.close();
  });

  it('open: any signed-in viewer is granted, even with no shared ride', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOpenRide(app);
    const rider = await registerAndLoginUser(app);
    await register(app, rider.rawToken, rideId);
    await setProfileVisibility(app, rider.rawToken, 'open');
    const registrationId = await getRegistrationId(app, rideId, token);

    const stranger = await registerAndLoginUser(app);
    const response = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/profile`,
      cookies: { session: stranger.rawToken },
    });
    expect(response.statusCode).toBe(200);
    await app.close();
  });

  it('returns bio, bikes and distance stats, never phone/email', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOpenRide(app);
    const rider = await registerAndLoginUser(app);
    await register(app, rider.rawToken, rideId);
    await app.inject({
      method: 'PATCH',
      url: '/v1/users/me',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rider.rawToken },
      payload: {
        profileVisibility: 'open',
        bio: 'Люблю рассветные заезды.',
        phone: '+79991234567',
        distanceWeekKm: 150,
      },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/users/me/bikes',
      headers: { origin: WEB_ORIGIN },
      cookies: { session: rider.rawToken },
      payload: { bikeType: 'gravel', brand: 'Canyon', isActive: true },
    });
    const registrationId = await getRegistrationId(app, rideId, token);

    const response = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/profile`,
      cookies: { session: token },
    });
    expect(response.statusCode).toBe(200);
    const profile = response.json().profile;
    expect(profile.bio).toBe('Люблю рассветные заезды.');
    expect(profile.distanceWeekKm).toBe(150);
    expect(profile.bikes).toHaveLength(1);
    expect(profile.bikes[0]).toMatchObject({
      bikeType: 'gravel',
      brand: 'Canyon',
    });
    expect(response.body).not.toContain('phone');
    expect(response.body).not.toContain('+79991234567');
    await app.close();
  });
});

describe('GET /v1/rides/:id/riders/:registrationId/avatar', () => {
  const s3Store = new Map<string, Buffer>();

  beforeEach(async () => {
    s3Store.clear();
    sendMock.mockReset();
    sendMock.mockImplementation(async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        s3Store.set(
          command.input.Key as string,
          Buffer.from(command.input.Body as Buffer),
        );
        return {};
      }
      if (command instanceof DeleteObjectCommand) {
        s3Store.delete(command.input.Key as string);
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const data = s3Store.get(command.input.Key as string);
        if (!data) throw new Error('NoSuchKey');
        return {
          ContentType: 'image/jpeg',
          Body: { transformToByteArray: async () => data },
        };
      }
      throw new Error(`Unexpected S3 command: ${String(command)}`);
    });
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  it('streams the rider’s avatar only when profile access is granted', async () => {
    const app = await buildApp(testEnv);
    const { token, rideId } = await createOpenRide(app);
    const rider = await registerAndLoginUser(app);
    await register(app, rider.rawToken, rideId);
    await setProfileVisibility(app, rider.rawToken, 'closed');

    const jpeg = await sharp({
      create: { width: 200, height: 200, channels: 3, background: 'red' },
    })
      .jpeg()
      .toBuffer();
    const boundary = `----testboundary${randomUUID()}`;
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
      ),
      jpeg,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    await app.inject({
      method: 'POST',
      url: '/v1/users/me/avatar',
      headers: {
        origin: WEB_ORIGIN,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      cookies: { session: rider.rawToken },
      payload: body,
    });

    const registrationId = await getRegistrationId(app, rideId, token);

    const stranger = await registerAndLoginUser(app);
    const denied = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/avatar`,
      cookies: { session: stranger.rawToken },
    });
    expect(denied.statusCode).toBe(403);

    const granted = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/riders/${registrationId}/avatar`,
      cookies: { session: token },
    });
    expect(granted.statusCode).toBe(200);
    expect(granted.headers['content-type']).toBe('image/jpeg');
    await app.close();
  });
});
