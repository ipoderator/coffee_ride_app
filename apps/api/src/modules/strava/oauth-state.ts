import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// CR-234 (ADR-033). The OAuth `state` round-trips through Strava and comes back on a
// GET the browser makes — the only thing tying the callback to the participant who
// pressed the button. It is an HMAC-signed `{userId, rideId, exp}` (key derived from
// AUTH_SECRET under its own label, so it never doubles as any other signature), and
// the callback also requires the signed `userId` to be the session's user: a state
// lured into another account's browser is refused, which is the CSRF protection for
// this one state-changing GET.
export const OAUTH_STATE_TTL_MS = 10 * 60_000;
const KEY_LABEL = 'coffee-ride/strava-oauth-state/v1';

export interface OAuthStatePayload {
  userId: string;
  rideId: string;
}

function stateKey(authSecret: string): Buffer {
  return createHmac('sha256', authSecret).update(KEY_LABEL).digest();
}

function sign(key: Buffer, body: string): string {
  return createHmac('sha256', key).update(body).digest('base64url');
}

export function createOAuthState(
  authSecret: string,
  payload: OAuthStatePayload,
  now: Date = new Date(),
): string {
  const body = Buffer.from(
    JSON.stringify({
      u: payload.userId,
      r: payload.rideId,
      e: now.getTime() + OAUTH_STATE_TTL_MS,
      n: randomBytes(8).toString('base64url'),
    }),
  ).toString('base64url');
  return `${body}.${sign(stateKey(authSecret), body)}`;
}

/** The payload of a genuine, unexpired state; `null` for anything else. */
export function readOAuthState(
  authSecret: string,
  state: string,
  now: Date = new Date(),
): OAuthStatePayload | null {
  const [body, signature, extra] = state.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(stateKey(authSecret), body));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as { u?: unknown }).u !== 'string' ||
    typeof (parsed as { r?: unknown }).r !== 'string' ||
    typeof (parsed as { e?: unknown }).e !== 'number'
  ) {
    return null;
  }
  const { u, r, e } = parsed as { u: string; r: string; e: number };
  if (e <= now.getTime()) return null;
  return { userId: u, rideId: r };
}
