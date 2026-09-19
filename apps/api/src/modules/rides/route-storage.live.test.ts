import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createS3Client } from '../../s3.js';
import {
  deleteGpxObject,
  downloadGpxObject,
  uploadGpxObject,
} from './route-storage.js';

// CR-080/KI-015. Unlike route.routes.test.ts (and every other apps/api S3
// consumer test), this file does NOT mock @aws-sdk/client-s3 — it exercises
// route-storage.ts's exported functions against a real S3-compatible store.
// KI-015 has flagged the S3 client as "never connected to a live MinIO"
// since CR-006, blocked every session so far on the local sandbox's Docker
// daemon being unreachable. A GitHub Actions runner is a different
// environment: it has real Docker for service containers, so CR-080 adds a
// `minio` service to ci.yml — this is the test that actually exercises it.
// Gated on RUN_LIVE_S3_TESTS, not just "are S3_* set" — a local .env has
// S3_* configured for MinIO by default (docker-compose.yml/.env.example)
// whether or not MinIO is actually running (Docker is unreachable in every
// sandbox this project has run in so far, KI-019), so presence alone is not
// a reliable signal that a store is actually reachable — confirmed the hard
// way in this session: with only the S3_*-present check, this test failed
// against this environment's real local .env (S3_* configured, no MinIO
// running) instead of skipping. ci.yml sets RUN_LIVE_S3_TESTS=1 once its
// `minio` service + bucket-creation step exist; nothing else should.
const hasLiveS3 = Boolean(
  process.env.RUN_LIVE_S3_TESTS === '1' &&
  process.env.S3_ENDPOINT &&
  process.env.S3_REGION &&
  process.env.S3_ACCESS_KEY_ID &&
  process.env.S3_SECRET_ACCESS_KEY &&
  process.env.S3_BUCKET,
);
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_REGION = process.env.S3_REGION;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;
const S3_BUCKET = process.env.S3_BUCKET;

describe.skipIf(!hasLiveS3)(
  'route-storage.ts against a live S3-compatible store',
  () => {
    const client = createS3Client({
      endpoint: S3_ENDPOINT!,
      region: S3_REGION!,
      accessKeyId: S3_ACCESS_KEY_ID!,
      secretAccessKey: S3_SECRET_ACCESS_KEY!,
    });
    const handle = { client, bucket: S3_BUCKET! };

    it('uploads, downloads, and deletes a real object round trip', async () => {
      const key = `route-storage-live-test/${randomUUID()}.gpx`;
      const body = Buffer.from(
        '<?xml version="1.0"?><gpx version="1.1"></gpx>',
        'utf-8',
      );

      await uploadGpxObject(handle, key, body);

      const downloaded = await downloadGpxObject(handle, key);
      expect(downloaded.body.equals(body)).toBe(true);
      expect(downloaded.contentType).toBe('application/gpx+xml');

      await deleteGpxObject(handle, key);

      await expect(downloadGpxObject(handle, key)).rejects.toThrow();
    });
  },
);
