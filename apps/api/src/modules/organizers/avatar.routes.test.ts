import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-097 (KI-023 remainder): same S3-mocking technique as `rides/
// cover-image.routes.test.ts`/`users/avatar.routes.test.ts`.
const sendMock = vi.fn();
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  class MockS3Client {
    send(...args: unknown[]) {
      return sendMock(...args);
    }
  }
  return {
    ...actual,
    S3Client: MockS3Client,
  };
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

function uniqueEmail() {
  return `${randomUUID()}@example.test`;
}

const PASSWORD = 'a-strong-password-123';

function sessionCookie(
  response: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>,
) {
  return response.cookies.find((c) => c.name === 'session');
}

async function registerLoginAndCreateOrganizer(
  app: Awaited<ReturnType<typeof buildApp>>,
) {
  const email = uniqueEmail();
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
  const rawToken = sessionCookie(login)!.value;

  const profile = await app.inject({
    method: 'POST',
    url: '/v1/organizers/me',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: rawToken },
    payload: { name: 'Гравийный клуб' },
  });

  return {
    rawToken,
    organizerId: profile.json().organizerProfile.id as string,
  };
}

function multipartFileBody(
  content: Buffer,
  filename: string,
  contentType: string,
) {
  const boundary = `----testboundary${randomUUID()}`;
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    content,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

let smallJpeg: Buffer;

beforeAll(async () => {
  smallJpeg = await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 3,
      background: { r: 200, g: 50, b: 50 },
    },
  })
    .jpeg()
    .toBuffer();
});

describe('organizer avatar', () => {
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
        if (!data) {
          throw new Error('NoSuchKey');
        }
        return {
          ContentType: 'image/jpeg',
          Body: { transformToByteArray: async () => data },
        };
      }
      throw new Error(`Unexpected S3 command: ${String(command)}`);
    });

    const app = await buildApp(testEnv);
    // `rides.organizer_id` FK is `onDelete: 'restrict'` — rides created in the
    // ride-embedding test below must go first (`cover-image.routes.test.ts`'s
    // same ordering).
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

  describe('POST /v1/organizers/me/avatar', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects an authenticated caller with no organizer profile with 404', async () => {
      const app = await buildApp(testEnv);
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
      const rawToken = sessionCookie(login)!.value;
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('organizer_profile_not_found');
      await app.close();
    });

    it('uploads an avatar and exposes it at the public GET /v1/organizers/:id/avatar path', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, organizerId } =
        await registerLoginAndCreateOrganizer(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().avatarUrl).toBe(
        `/v1/organizers/${organizerId}/avatar`,
      );

      // Own profile reflects it.
      const me = await app.inject({
        method: 'GET',
        url: '/v1/organizers/me',
        cookies: { session: rawToken },
      });
      expect(me.json().organizerProfile.avatarUrl).toBe(
        `/v1/organizers/${organizerId}/avatar`,
      );

      // CR-097: also embedded in `RideOrganizerSummary` via `rides.service.ts`'s
      // cross-module reuse of `organizerAvatarUrlPath`.
      const ride = await app.inject({
        method: 'POST',
        url: '/v1/rides',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
        payload: {
          title: 'Маршрут выходного дня',
          bicycleType: 'gravel',
          startsAt: '2027-05-01T05:00:00.000Z',
          startTimezone: 'Europe/Moscow',
        },
      });
      const rideDetail = await app.inject({
        method: 'GET',
        url: `/v1/rides/${ride.json().ride.id}`,
        cookies: { session: rawToken },
      });
      expect(rideDetail.json().organizer.avatarUrl).toBe(
        `/v1/organizers/${organizerId}/avatar`,
      );

      // Publicly downloadable with no session at all.
      const download = await app.inject({
        method: 'GET',
        url: `/v1/organizers/${organizerId}/avatar`,
      });
      expect(download.statusCode).toBe(200);
      expect(download.headers['content-type']).toBe('image/jpeg');

      await app.close();
    });

    it('rejects a second upload with 409 avatar_already_exists', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerLoginAndCreateOrganizer(app);
      const first = multipartFileBody(smallJpeg, 'avatar.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': first.contentType },
        cookies: { session: rawToken },
        payload: first.body,
      });

      const second = multipartFileBody(smallJpeg, 'avatar.jpg', 'image/jpeg');
      const response = await app.inject({
        method: 'POST',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': second.contentType },
        cookies: { session: rawToken },
        payload: second.body,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('avatar_already_exists');
      await app.close();
    });
  });

  describe('PATCH /v1/organizers/me/avatar', () => {
    it('replaces an existing avatar and deletes the old S3 object', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, organizerId } =
        await registerLoginAndCreateOrganizer(app);
      const first = multipartFileBody(smallJpeg, 'avatar.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': first.contentType },
        cookies: { session: rawToken },
        payload: first.body,
      });
      expect(s3Store.size).toBe(1);

      const second = multipartFileBody(smallJpeg, 'avatar2.jpg', 'image/jpeg');
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': second.contentType },
        cookies: { session: rawToken },
        payload: second.body,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().avatarUrl).toBe(
        `/v1/organizers/${organizerId}/avatar`,
      );
      expect(s3Store.size).toBe(1);
      await app.close();
    });

    it('rejects a replace with 404 avatar_not_found when none exists yet', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerLoginAndCreateOrganizer(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('avatar_not_found');
      await app.close();
    });
  });

  describe('DELETE /v1/organizers/me/avatar', () => {
    it('deletes an existing avatar; the public download then 404s', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, organizerId } =
        await registerLoginAndCreateOrganizer(app);
      const upload = multipartFileBody(smallJpeg, 'avatar.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': upload.contentType },
        cookies: { session: rawToken },
        payload: upload.body,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });
      expect(response.statusCode).toBe(204);
      expect(s3Store.size).toBe(0);

      const download = await app.inject({
        method: 'GET',
        url: `/v1/organizers/${organizerId}/avatar`,
      });
      expect(download.statusCode).toBe(404);

      await app.close();
    });

    it('rejects a delete with 404 avatar_not_found when none exists', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerLoginAndCreateOrganizer(app);

      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/organizers/me/avatar',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('avatar_not_found');
      await app.close();
    });
  });

  describe('GET /v1/organizers/:id/avatar', () => {
    it('returns 404 for a non-existent organizer id, no auth required', async () => {
      const app = await buildApp(testEnv);
      const response = await app.inject({
        method: 'GET',
        url: `/v1/organizers/${randomUUID()}/avatar`,
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('avatar_not_found');
      await app.close();
    });

    it('returns 404 for an organizer with no avatar uploaded', async () => {
      const app = await buildApp(testEnv);
      const { organizerId } = await registerLoginAndCreateOrganizer(app);
      const response = await app.inject({
        method: 'GET',
        url: `/v1/organizers/${organizerId}/avatar`,
      });
      expect(response.statusCode).toBe(404);
      await app.close();
    });
  });
});
