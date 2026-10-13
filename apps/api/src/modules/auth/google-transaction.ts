import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

// CR-247 (ADR-034). What `GET /v1/auth/google` must remember until Google sends the
// browser back: the `state`, the `nonce`, the PKCE verifier and the validated return
// target. It lives in one short-lived httpOnly cookie, HMAC-signed (key derived from
// AUTH_SECRET under its own label, so it never doubles as another signature) and
// carrying its own expiry — a cookie the browser kept past `Max-Age`, or one edited
// by hand, is refused. The `state` in it is compared with the one Google returns:
// that ties the callback to the browser that started the flow (login CSRF).
export const GOOGLE_TRANSACTION_TTL_MS = 10 * 60_000;
const KEY_LABEL = 'coffee-ride/google-oauth-transaction/v1';

export interface GoogleTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  next: string | null;
}

function transactionKey(authSecret: string): Buffer {
  return createHmac('sha256', authSecret).update(KEY_LABEL).digest();
}

function sign(key: Buffer, body: string): string {
  return createHmac('sha256', key).update(body).digest('base64url');
}

export function sealGoogleTransaction(
  authSecret: string,
  transaction: GoogleTransaction,
  now: Date = new Date(),
): string {
  const body = Buffer.from(
    JSON.stringify({
      s: transaction.state,
      n: transaction.nonce,
      v: transaction.codeVerifier,
      x: transaction.next,
      e: now.getTime() + GOOGLE_TRANSACTION_TTL_MS,
    }),
  ).toString('base64url');
  return `${body}.${sign(transactionKey(authSecret), body)}`;
}

/** The transaction from a genuine, unexpired cookie value; `null` for anything else. */
export function openGoogleTransaction(
  authSecret: string,
  sealed: string,
  now: Date = new Date(),
): GoogleTransaction | null {
  const [body, signature, extra] = sealed.split('.');
  if (!body || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(transactionKey(authSecret), body));
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
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { s, n, v, x, e } = parsed as Record<string, unknown>;
  if (
    typeof s !== 'string' ||
    typeof n !== 'string' ||
    typeof v !== 'string' ||
    (x !== null && typeof x !== 'string') ||
    typeof e !== 'number' ||
    e <= now.getTime()
  ) {
    return null;
  }
  return { state: s, nonce: n, codeVerifier: v, next: x };
}

/** Constant-time comparison of the state Google returned with the cookie's. */
export function stateMatches(expected: string, actual: unknown): boolean {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

function randomValue(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Fresh `state`, `nonce` and PKCE verifier (32 random bytes each) for one sign-in,
 * plus the verifier's S256 challenge (RFC 7636) that goes to Google.
 */
export function newGoogleTransaction(next: string | null): {
  transaction: GoogleTransaction;
  codeChallenge: string;
} {
  const codeVerifier = randomValue();
  return {
    transaction: {
      state: randomValue(),
      nonce: randomValue(),
      codeVerifier,
      next,
    },
    codeChallenge: createHash('sha256')
      .update(codeVerifier)
      .digest('base64url'),
  };
}
