import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  GOOGLE_TRANSACTION_TTL_MS,
  newGoogleTransaction,
  openGoogleTransaction,
  sealGoogleTransaction,
  stateMatches,
} from './google-transaction.js';

// CR-247 (ADR-034): the signed sign-in cookie.

const SECRET = 'a-test-only-secret';
const TX = { state: 's', nonce: 'n', codeVerifier: 'v', next: '/rides/abc' };

// The same derivation as the module, to sign bodies it would never produce itself.
function signRaw(body: unknown): string {
  const key = createHmac('sha256', SECRET)
    .update('coffee-ride/google-oauth-transaction/v1')
    .digest();
  const encoded = Buffer.from(
    typeof body === 'string' ? body : JSON.stringify(body),
  ).toString('base64url');
  return `${encoded}.${createHmac('sha256', key).update(encoded).digest('base64url')}`;
}

describe('google transaction cookie', () => {
  it('round-trips until its expiry, then refuses', () => {
    const now = new Date('2026-10-13T10:00:00Z');
    const sealed = sealGoogleTransaction(SECRET, TX, now);
    expect(openGoogleTransaction(SECRET, sealed, now)).toEqual(TX);
    expect(
      openGoogleTransaction(
        SECRET,
        sealed,
        new Date(now.getTime() + GOOGLE_TRANSACTION_TTL_MS),
      ),
    ).toBeNull();
  });

  it('refuses a forged signature, another key and a malformed value', () => {
    const sealed = sealGoogleTransaction(SECRET, TX);
    const [body] = sealed.split('.');
    expect(openGoogleTransaction(SECRET, `${body}.AAAA`)).toBeNull();
    expect(openGoogleTransaction('another-secret', sealed)).toBeNull();
    expect(openGoogleTransaction(SECRET, `${sealed}.extra`)).toBeNull();
    expect(openGoogleTransaction(SECRET, 'no-dot')).toBeNull();
  });

  it('refuses a correctly signed body of the wrong shape', () => {
    const future = Date.now() + 60_000;
    for (const body of [
      'not json',
      null,
      { s: 's', n: 'n', v: 'v', x: 42, e: future },
      { s: 's', n: 'n', v: 'v', x: null },
      { s: 's', n: 1, v: 'v', x: null, e: future },
    ]) {
      expect(openGoogleTransaction(SECRET, signRaw(body))).toBeNull();
    }
    expect(
      openGoogleTransaction(
        SECRET,
        signRaw({ s: 's', n: 'n', v: 'v', x: null, e: future }),
      ),
    ).toEqual({ state: 's', nonce: 'n', codeVerifier: 'v', next: null });
  });

  it('compares state in constant time and only with a string', () => {
    expect(stateMatches('abc', 'abc')).toBe(true);
    expect(stateMatches('abc', 'abd')).toBe(false);
    expect(stateMatches('abc', 'abcd')).toBe(false);
    expect(stateMatches('abc', undefined)).toBe(false);
    expect(stateMatches('abc', ['abc'])).toBe(false);
  });

  it('issues fresh random values and the S256 challenge of the verifier', () => {
    const a = newGoogleTransaction('/me');
    const b = newGoogleTransaction(null);
    expect(a.transaction.state).not.toBe(b.transaction.state);
    expect(a.transaction.nonce).not.toBe(a.transaction.state);
    expect(a.transaction.codeVerifier).toMatch(/^[\w-]{43}$/);
    expect(a.codeChallenge).toBe(
      createHash('sha256')
        .update(a.transaction.codeVerifier)
        .digest('base64url'),
    );
    expect(a.transaction.next).toBe('/me');
  });
});
