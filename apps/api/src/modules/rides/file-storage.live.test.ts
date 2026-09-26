import {
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
} from '@aws-sdk/client-s3';
import { sql } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import {
  WEB_ORIGIN,
  gpxTrack,
  multipartFile,
  organizerWithDraftRide,
} from '../../test-support/app-fixtures.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';

// CR-137. The whole file lifecycle over HTTP against a real S3-compatible
// store: `route-storage.live.test.ts` covers the storage functions alone,
// every `*.routes.test.ts` mocks the S3 client. Here nothing is mocked —
// multipart upload → object in the bucket → download through the API →
// replace (old object gone) → delete (object gone). Same opt-in as
// `route-storage.live.test.ts` (see its comment for why S3_* alone isn't
// enough): CI's MinIO service sets RUN_LIVE_S3_TESTS=1, a local run needs
// `docker compose up -d` plus that variable.
const hasLiveS3 = Boolean(
  process.env.RUN_LIVE_S3_TESTS === '1' &&
  process.env.S3_ENDPOINT &&
  process.env.S3_REGION &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY &&
  process.env.S3_BUCKET,
);

describe.skipIf(!hasLiveS3)('ride files against a live S3 store', () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    AUTH_SECRET: 'a-test-only-secret',
    DATABASE_URL: getTestDatabaseUrl(),
    WEB_ORIGIN,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
  });
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp(env);
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
  });

  afterAll(async () => {
    await app.db.execute(sql`DELETE FROM rides`);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  function s3() {
    if (!app.s3) throw new Error('S3 is not configured');
    return app.s3;
  }

  async function objectExists(key: string): Promise<boolean> {
    try {
      await s3().client.send(
        new HeadObjectCommand({ Bucket: s3().bucket, Key: key }),
      );
      return true;
    } catch (error) {
      if (error instanceof NotFound) return false;
      throw error;
    }
  }

  async function objectBytes(key: string): Promise<Buffer> {
    const result = await s3().client.send(
      new GetObjectCommand({ Bucket: s3().bucket, Key: key }),
    );
    return Buffer.from(await result.Body!.transformToByteArray());
  }

  async function columnValue(query: ReturnType<typeof sql>) {
    const rows = (await app.db.execute(query)) as unknown as Array<{
      key: string | null;
    }>;
    return rows[0]?.key ?? null;
  }

  it('GPX: upload → stored object → download → replace → delete', async () => {
    const { rawToken, rideId } = await organizerWithDraftRide(app);
    const auth = { origin: WEB_ORIGIN };
    const gpxKey = () =>
      columnValue(
        sql`SELECT gpx_file_key AS key FROM routes WHERE ride_id = ${rideId}`,
      );

    const firstGpx = gpxTrack([
      [55.75, 37.6],
      [55.7545, 37.6],
    ]);
    const upload = multipartFile(firstGpx, 'route.gpx', 'application/gpx+xml');
    const created = await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/route`,
      headers: { ...auth, 'content-type': upload.contentType },
      cookies: { session: rawToken },
      payload: upload.body,
    });
    expect(created.statusCode).toBe(201);

    const firstKey = await gpxKey();
    expect(firstKey).not.toBeNull();
    expect(await objectExists(firstKey!)).toBe(true);
    expect((await objectBytes(firstKey!)).toString('utf-8')).toBe(firstGpx);

    const download = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/route/download`,
      cookies: { session: rawToken },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toContain('application/gpx+xml');
    expect(download.body).toBe(firstGpx);

    const secondGpx = gpxTrack([
      [55.76, 37.61],
      [55.77, 37.62],
      [55.78, 37.63],
    ]);
    const replacement = multipartFile(
      secondGpx,
      'route-v2.gpx',
      'application/gpx+xml',
    );
    const replaced = await app.inject({
      method: 'PATCH',
      url: `/v1/rides/${rideId}/route`,
      headers: { ...auth, 'content-type': replacement.contentType },
      cookies: { session: rawToken },
      payload: replacement.body,
    });
    expect(replaced.statusCode).toBe(200);

    const secondKey = await gpxKey();
    expect(secondKey).not.toBe(firstKey);
    expect(await objectExists(secondKey!)).toBe(true);
    expect(await objectExists(firstKey!)).toBe(false);
    const redownload = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/route/download`,
      cookies: { session: rawToken },
    });
    expect(redownload.body).toBe(secondGpx);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${rideId}/route`,
      headers: auth,
      cookies: { session: rawToken },
    });
    expect(deleted.statusCode).toBe(204);
    expect(await gpxKey()).toBeNull();
    expect(await objectExists(secondKey!)).toBe(false);

    const gone = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/route/download`,
      cookies: { session: rawToken },
    });
    expect(gone.statusCode).toBe(404);
  });

  it('cover image: upload → stored object → download → delete', async () => {
    const { rawToken, rideId } = await organizerWithDraftRide(app);
    const auth = { origin: WEB_ORIGIN };
    const coverKey = () =>
      columnValue(
        sql`SELECT cover_image_key AS key FROM rides WHERE id = ${rideId}`,
      );

    const jpeg = await sharp({
      create: {
        width: 320,
        height: 200,
        channels: 3,
        background: { r: 130, g: 102, b: 140 },
      },
    })
      .jpeg()
      .toBuffer();
    const upload = multipartFile(jpeg, 'cover.jpg', 'image/jpeg');
    const created = await app.inject({
      method: 'POST',
      url: `/v1/rides/${rideId}/cover`,
      headers: { ...auth, 'content-type': upload.contentType },
      cookies: { session: rawToken },
      payload: upload.body,
    });
    expect(created.statusCode).toBe(201);

    const key = await coverKey();
    expect(key).not.toBeNull();
    expect(await objectExists(key!)).toBe(true);
    const stored = await objectBytes(key!);
    expect((await sharp(stored).metadata()).width).toBe(320);

    const download = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/cover`,
      cookies: { session: rawToken },
    });
    expect(download.statusCode).toBe(200);
    expect(download.headers['content-type']).toMatch(/^image\//);
    expect(download.rawPayload.equals(stored)).toBe(true);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/v1/rides/${rideId}/cover`,
      headers: auth,
      cookies: { session: rawToken },
    });
    expect(deleted.statusCode).toBe(204);
    expect(await coverKey()).toBeNull();
    expect(await objectExists(key!)).toBe(false);

    const gone = await app.inject({
      method: 'GET',
      url: `/v1/rides/${rideId}/cover`,
      cookies: { session: rawToken },
    });
    expect(gone.statusCode).toBe(404);
  });
});
