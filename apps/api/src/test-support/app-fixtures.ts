import { randomUUID } from 'node:crypto';
import type { buildApp } from '../app.js';

// CR-137. Request helpers for the integration suites that drive a whole
// journey through `buildApp` (`file-storage.live.test.ts`,
// `degraded-dependencies.test.ts`). Older suites keep their own inline
// copies of the same steps.

type App = Awaited<ReturnType<typeof buildApp>>;

export const WEB_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'a-strong-password-123';

/** Registers, verifies and signs in a fresh user; returns the session token. */
export async function signUp(app: App): Promise<string> {
  const email = `${randomUUID()}@example.test`;
  const register = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    headers: { origin: WEB_ORIGIN },
    payload: { email, password: PASSWORD },
  });
  if (register.statusCode !== 201) {
    throw new Error(`register failed: ${register.statusCode} ${register.body}`);
  }
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
  const session = login.cookies.find((c) => c.name === 'session');
  if (!session) {
    throw new Error(`login failed: ${login.statusCode} ${login.body}`);
  }
  return session.value;
}

/** A signed-in organizer with one draft ride. */
export async function organizerWithDraftRide(
  app: App,
): Promise<{ rawToken: string; rideId: string }> {
  const rawToken = await signUp(app);
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
  if (ride.statusCode !== 201) {
    throw new Error(`ride create failed: ${ride.statusCode} ${ride.body}`);
  }
  return { rawToken, rideId: ride.json().ride.id as string };
}

/** One-file `multipart/form-data` body under the field name `file`. */
export function multipartFile(
  content: Buffer | string,
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
    Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

export function gpxTrack(points: Array<[lat: number, lng: number]>): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<gpx version="1.1" creator="test"><trk><trkseg>' +
    points
      .map(
        ([lat, lng]) =>
          `<trkpt lat="${lat}" lon="${lng}"><ele>100</ele></trkpt>`,
      )
      .join('') +
    '</trkseg></trk></gpx>'
  );
}
