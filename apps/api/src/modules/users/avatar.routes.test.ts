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
// cover-image.routes.test.ts` — mocks the wire call only, so this exercises the
// real relocated `lib/image-processing.ts`/`lib/image-storage.ts` and
// `users.service.ts` avatar functions without a live MinIO.
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
let largeJpeg: Buffer; // 3000x2000 — exercises the 1920-max resize bound.

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
});

describe('/v1/users/me/avatar', () => {
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
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  afterAll(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  describe('POST /v1/users/me/avatar', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        payload: body,
      });

      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('rejects a request with no file part with 400 avatar_missing', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const boundary = `----testboundary${randomUUID()}`;

      const response = await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
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
      expect(response.json().code).toBe('avatar_missing');
      await app.close();
    });

    it('rejects a non-image file with 400 avatar_invalid', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        Buffer.from('not an image at all'),
        'notes.txt',
        'text/plain',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('avatar_invalid');
      await app.close();
    });

    it('rejects an upload larger than the 8 MB cap with 400 avatar_too_large', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const oversized = Buffer.alloc(8 * 1024 * 1024 + 1024, 1);
      const { body, contentType } = multipartFileBody(
        oversized,
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().code).toBe('avatar_too_large');
      await app.close();
    }, 20000);

    it('uploads a JPEG, resizes it to fit within 1920x1920, and reflects it on GET /v1/auth/me', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        largeJpeg,
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().avatarUrl).toBe('/v1/users/me/avatar');
      expect(sendMock).toHaveBeenCalled();

      const stored = [...s3Store.values()][0]!;
      const metadata = await sharp(stored).metadata();
      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1280);

      const me = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        cookies: { session: rawToken },
      });
      expect(me.json().user.avatarUrl).toBe('/v1/users/me/avatar');

      await app.close();
    });

    it('rejects a second upload with 409 avatar_already_exists', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const first = multipartFileBody(smallJpeg, 'avatar.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': first.contentType },
        cookies: { session: rawToken },
        payload: first.body,
      });

      const second = multipartFileBody(smallJpeg, 'avatar.jpg', 'image/jpeg');
      const response = await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': second.contentType },
        cookies: { session: rawToken },
        payload: second.body,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().code).toBe('avatar_already_exists');
      await app.close();
    });

    it('returns 503 avatar_storage_unavailable when S3 is not configured', async () => {
      const app = await buildApp(testEnvNoS3);
      const { rawToken } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().code).toBe('avatar_storage_unavailable');
      await app.close();
    });
  });

  describe('PATCH /v1/users/me/avatar', () => {
    it('rejects a replace with 404 avatar_not_found when none exists yet', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const { body, contentType } = multipartFileBody(
        smallJpeg,
        'avatar.jpg',
        'image/jpeg',
      );

      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': contentType },
        cookies: { session: rawToken },
        payload: body,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('avatar_not_found');
      await app.close();
    });

    it('replaces an existing avatar and deletes the old S3 object', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const first = multipartFileBody(smallJpeg, 'avatar.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': first.contentType },
        cookies: { session: rawToken },
        payload: first.body,
      });
      expect(s3Store.size).toBe(1);

      const second = multipartFileBody(largeJpeg, 'avatar2.jpg', 'image/jpeg');
      const response = await app.inject({
        method: 'PATCH',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': second.contentType },
        cookies: { session: rawToken },
        payload: second.body,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().avatarUrl).toBe('/v1/users/me/avatar');
      // Old key deleted, only the new one remains.
      expect(s3Store.size).toBe(1);
      const stored = [...s3Store.values()][0]!;
      const metadata = await sharp(stored).metadata();
      expect(metadata.width).toBe(1920);

      await app.close();
    });
  });

  describe('DELETE /v1/users/me/avatar', () => {
    it('rejects a delete with 404 avatar_not_found when none exists', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('avatar_not_found');
      await app.close();
    });

    it('deletes an existing avatar; the account then has none', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const upload = multipartFileBody(smallJpeg, 'avatar.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': upload.contentType },
        cookies: { session: rawToken },
        payload: upload.body,
      });

      const response = await app.inject({
        method: 'DELETE',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN },
        cookies: { session: rawToken },
      });
      expect(response.statusCode).toBe(204);
      expect(s3Store.size).toBe(0);

      const download = await app.inject({
        method: 'GET',
        url: '/v1/users/me/avatar',
        cookies: { session: rawToken },
      });
      expect(download.statusCode).toBe(404);

      const me = await app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        cookies: { session: rawToken },
      });
      expect(me.json().user.avatarUrl).toBeNull();

      await app.close();
    });
  });

  describe('GET /v1/users/me/avatar', () => {
    it('rejects a request with no session cookie with 401', async () => {
      const app = await buildApp(testEnv);
      const response = await app.inject({
        method: 'GET',
        url: '/v1/users/me/avatar',
      });
      expect(response.statusCode).toBe(401);
      await app.close();
    });

    it('returns 404 avatar_not_found when none exists', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);

      const response = await app.inject({
        method: 'GET',
        url: '/v1/users/me/avatar',
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe('avatar_not_found');
      await app.close();
    });

    it('streams the stored bytes with the stored content type', async () => {
      const app = await buildApp(testEnv);
      const { rawToken } = await registerAndLogin(app);
      const upload = multipartFileBody(smallJpeg, 'avatar.jpg', 'image/jpeg');
      await app.inject({
        method: 'POST',
        url: '/v1/users/me/avatar',
        headers: { origin: WEB_ORIGIN, 'content-type': upload.contentType },
        cookies: { session: rawToken },
        payload: upload.body,
      });

      const response = await app.inject({
        method: 'GET',
        url: '/v1/users/me/avatar',
        cookies: { session: rawToken },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      const metadata = await sharp(response.rawPayload).metadata();
      expect(metadata.width).toBe(400);
      await app.close();
    });
  });
});
