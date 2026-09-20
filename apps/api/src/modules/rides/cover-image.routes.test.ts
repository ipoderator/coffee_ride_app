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

// ADR-019/CR-086: mocks the S3 wire call only (`S3Client.prototype.send`) — same
// technique `route.routes.test.ts` uses — so this suite runs without a live MinIO
// (KI-015/KI-019) while still exercising the real `cover-image-storage.ts`/
// `cover-image.ts`/`rides.service.ts` code paths. `sharp` itself is NOT mocked —
// the resize/format-validation behavior is real.
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

// Same env, but no S3_* at all — `plugins/s3.ts` decorates `app.s3` as `null`.
const testEnvNoS3 = loadEnv({
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

  await app.inject({
    method: 'POST',
    url: '/v1/organizers/me',
    headers: { origin: WEB_ORIGIN },
    cookies: { session: rawToken },
    payload: { name: 'Гравийный клуб' },
  });

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

  return { rawToken, rideId: ride.json().ride.id as string };
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

// Real JPEG/PNG bytes, generated once — `sharp` itself is not mocked, so the
// upload path's format-detection/resize logic runs for real against these.
let smallJpeg: Buffer;
let largeJpeg: Buffer; // 3000x2000 — exercises the 1920-max resize bound.
let smallPng: Buffer;

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
  largeJpeg = await sharp({
    create: {
      width: 3000,
      height: 2000,
      channels: 3,
      background: { r: 10, g: 10, b: 200 },
    },
  })
    .jpeg()
    .toBuffer();
  smallPng = await sharp({
    create: {
      width: 200,
      height: 200,
      channels: 4,
      background: { r: 0, g: 200, b: 0, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
});

describe('/v1/rides/:id/cover', () => {
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

  describe('POST /v1/rides/:id/cover', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'cover.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a non-existent ride with 404', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'cover.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${randomUUID()}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it("rejects a stranger's ride with 404", async () => {
      const app = await buildApp(testEnv);
      const { rideId } = await registerAndLogin(app);
      const { rawToken: strangerToken } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'cover.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: strangerToken },
        payload: body,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('ride_not_found');
      await app.close();
    });

    it('rejects a request with no file part with 400 cover_image_missing', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const boundary = `----testboundary${randomUUID()}`;

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: {
          origin: WEB_ORIGIN,
          'content-type': `multipart/form-data; boundary=${boundary}`,
        },
        cookies: { session: rawToken },
        payload: Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="notfile"\r\n\r\nx\r\n--${boundary}--\r\n`,
        ),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('cover_image_missing');
      await app.close();
    });

    it('rejects a non-image file with 400 cover_image_invalid', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        Buffer.from('not an image at all'),
        'notes.txt',
        'text/plain',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('cover_image_invalid');
      await app.close();
    });

    it('rejects an upload larger than the 8 MB cap with 400 cover_image_too_large', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const oversized = Buffer.alloc(8 * 1024 * 1024 + 1024, 1);
      const { body, contentType } = multipartFileBody(
        oversized,
        'cover.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('cover_image_too_large');
      await app.close();
    }, 20000);

    it('uploads a JPEG and resizes it to fit within 1920x1920', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        largeJpeg,
        'cover.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().coverImageUrl).toBe(`/v1/rides/${rideId}/cover`);
      expect(sendMock).toHaveBeenCalled();

      const stored = [...s3Store.values()][0]!;
      const metadata = await sharp(stored).metadata();
      // Source was 3000x2000 (3:2) — bounded to 1920 on the long edge, aspect kept.
      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1280);

      // Cross-checked against the ride detail response, same precedent as `.../route`.
      const detail = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
        cookies: { session: rawToken },
      });
      expect(detail.json().ride.coverImageUrl).toBe(
        `/v1/rides/${rideId}/cover`,
      );

      await app.close();
    });

    it('does not upscale a smaller image', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'cover.jpg',
        'image/jpeg',
      );

      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      const stored = [...s3Store.values()][0]!;
      const metadata = await sharp(stored).metadata();
      expect(metadata.width).toBe(400);
      expect(metadata.height).toBe(300);
      await app.close();
    });

    it('accepts a PNG', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        smallPng,
        'cover.png',
        'image/png',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      await app.close();
    });

    it('rejects a second upload with 409 cover_image_already_exists', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const first = multipartFileBody(smallJpeg, 'cover.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': first.contentType },
        cookies: { session: rawToken },
        payload: first.body,
      });

      const second = multipartFileBody(smallJpeg, 'cover.jpg', 'image/jpeg');
      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': second.contentType },
        cookies: { session: rawToken },
        payload: second.body,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('cover_image_already_exists');
      await app.close();
    });

    it('rejects upload once the ride has left draft with 409 ride_not_editable', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'cover.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('ride_not_editable');
      await app.close();
    });

    it('returns 503 cover_storage_unavailable when S3 is not configured', async () => {
      const app = await buildApp(testEnvNoS3);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'cover.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('cover_storage_unavailable');
      await app.close();
    });

    it('returns 503 cover_storage_unavailable when the S3 call fails', async () => {
      sendMock.mockRejectedValue(new Error('simulated S3 outage'));
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'cover.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('cover_storage_unavailable');
      expect(sendMock).toHaveBeenCalledTimes(2);
      await app.close();
    });
  });

  describe('PATCH /v1/rides/:id/cover', () => {
    it('returns 404 cover_image_not_found when no cover exists yet', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'cover.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('cover_image_not_found');
      await app.close();
    });

    it('replaces an existing cover, deleting the old S3 object', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const first = multipartFileBody(smallJpeg, 'cover.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': first.contentType },
        cookies: { session: rawToken },
        payload: first.body,
      });
      expect(s3Store.size).toBe(1);

      const second = multipartFileBody(smallPng, 'cover.png', 'image/png');
      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': second.contentType },
        cookies: { session: rawToken },
        payload: second.body,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().coverImageUrl).toBe(`/v1/rides/${rideId}/cover`);
      // Old object deleted, exactly one (the new one) remains.
      expect(s3Store.size).toBe(1);
      await app.close();
    });
  });

  describe('DELETE /v1/rides/:id/cover', () => {
    it('returns 404 cover_image_not_found when no cover exists yet', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('cover_image_not_found');
      await app.close();
    });

    it('deletes the cover, clearing GET /v1/rides/:id’s coverImageUrl', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartFileBody(smallJpeg, 'cover.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(204);
      expect(s3Store.size).toBe(0);

      const detail = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}`,
        cookies: { session: rawToken },
      });
      expect(detail.json().ride.coverImageUrl).toBeNull();
      await app.close();
    });
  });

  describe('GET /v1/rides/:id/cover', () => {
    it('lets the owner view a draft ride’s cover', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartFileBody(smallJpeg, 'cover.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/cover`,
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.headers['cache-control']).toBe(
        'public, max-age=31536000, immutable',
      );
      await app.close();
    });

    it("hides a stranger's draft ride cover with 404", async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartFileBody(smallJpeg, 'cover.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });
      const { rawToken: strangerToken } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/cover`,
        cookies: { session: strangerToken },
      });

      expect(response.statusCode).toBe(404);
      await app.close();
    });

    it('lets any viewer see a published ride’s cover without a session', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);
      const uploaded = multipartFileBody(smallJpeg, 'cover.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/cover`,
        headers: { origin: WEB_ORIGIN, 'content-type': uploaded.contentType },
        cookies: { session: rawToken },
        payload: uploaded.body,
      });
      await app.inject({
        method: 'POST',
        url: `/v1/rides/${rideId}/publish`,
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/cover`,
      });

      expect(response.statusCode).toBe(200);
      await app.close();
    });

    it('returns 404 cover_image_not_found for a visible ride with no cover', async () => {
      const app = await buildApp(testEnv);
      const { rawToken, rideId } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'GET',
        url: `/v1/rides/${rideId}/cover`,
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('cover_image_not_found');
      await app.close();
    });
  });
});
