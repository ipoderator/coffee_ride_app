import { describe, expect, it, vi } from 'vitest';
import {
  createFakeGoogle,
  FAKE_GOOGLE_CLIENT_ID,
  FAKE_GOOGLE_CLIENT_SECRET,
  type FakeGoogleUser,
} from '../../test-support/fake-google.js';
import {
  createGoogleOidcClient,
  GoogleRejectedError,
  GoogleUnavailableError,
} from './google-client.js';
import { newOAuthTransaction } from './oauth-transaction.js';

// CR-247 (ADR-034): the Google OIDC client on its own — resilience (timeout/retry/
// breaker per `.claude/rules/resilience.md`) and the error mapping the route relies on.

// Lets a test replace openid-client's code grant to reach paths a real Google
// response can't (an unexpected error type, a response without claims).
const grantOverride = vi.hoisted(() => ({
  fn: null as null | (() => Promise<unknown>),
}));
vi.mock('openid-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('openid-client')>();
  return {
    ...actual,
    authorizationCodeGrant: (
      ...args: Parameters<typeof actual.authorizationCodeGrant>
    ) =>
      grantOverride.fn
        ? grantOverride.fn()
        : actual.authorizationCodeGrant(...args),
  };
});

const REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';

function setup() {
  const google = createFakeGoogle();
  const client = createGoogleOidcClient({
    clientId: FAKE_GOOGLE_CLIENT_ID,
    clientSecret: FAKE_GOOGLE_CLIENT_SECRET,
    fetchImpl: google.fetchImpl,
  });

  async function signIn(
    user: Partial<FakeGoogleUser> = {},
    tamper?: (query: URLSearchParams) => void,
  ) {
    const { transaction, codeChallenge } = newOAuthTransaction(null);
    const url = client.authorizationUrl({
      redirectUri: REDIRECT_URI,
      state: transaction.state,
      nonce: transaction.nonce,
      codeChallenge,
    });
    const query = google.consent(url, {
      sub: '1234567890',
      email: 'rider@gmail.test',
      email_verified: true,
      ...user,
    });
    tamper?.(query);
    const callbackUrl = new URL(REDIRECT_URI);
    callbackUrl.search = query.toString();
    return client.completeSignIn({
      callbackUrl,
      expectedState: transaction.state,
      expectedNonce: transaction.nonce,
      codeVerifier: transaction.codeVerifier,
    });
  }

  return { google, signIn };
}

describe('createGoogleOidcClient', () => {
  it('returns only the identity claims, tolerating a string email_verified and absent names', async () => {
    const { signIn } = setup();
    const identity = await signIn({
      email_verified: 'true' as unknown as boolean,
      given_name: '  ',
      family_name: undefined,
    });
    expect(identity).toEqual({
      sub: '1234567890',
      email: 'rider@gmail.test',
      emailVerified: true,
      givenName: null,
      familyName: null,
    });
  });

  it('treats a missing email_verified as unverified', async () => {
    const { signIn } = setup();
    const identity = await signIn({ email_verified: undefined });
    expect(identity.emailVerified).toBe(false);
  });

  it('retries the idempotent JWKS read once, never the code exchange', async () => {
    const { google, signIn } = setup();
    google.outage.jwks503 = 1;
    await expect(signIn()).resolves.toMatchObject({ sub: '1234567890' });
    const jwks = google.requests.filter((r) => r.url.endsWith('/certs'));
    const token = google.requests.filter((r) => r.url.endsWith('/token'));
    expect(jwks).toHaveLength(2);
    expect(token).toHaveLength(1);
  });

  it('maps a network failure to GoogleUnavailableError and opens the breaker after five', async () => {
    const { google, signIn } = setup();
    google.outage.network = true;
    for (let i = 0; i < 5; i += 1) {
      await expect(signIn()).rejects.toThrow('Google request failed.');
    }
    const before = google.requests.length;
    const error = await signIn().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleUnavailableError);
    expect((error as Error).message).toContain('circuit open');
    // Short-circuited: no request left the process.
    expect(google.requests).toHaveLength(before);
  });

  it('reports a non-consent authorization error as rejected', async () => {
    const { signIn } = setup();
    const error = await signIn({}, (q) => {
      q.delete('code');
      q.set('error', 'server_error');
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoogleRejectedError);
    expect((error as GoogleRejectedError).reason).toBe('rejected');
  });

  it('passes an unexpected error through, and refuses a response without claims', async () => {
    const { signIn } = setup();
    try {
      grantOverride.fn = () => Promise.reject(new RangeError('unexpected'));
      await expect(signIn()).rejects.toBeInstanceOf(RangeError);

      grantOverride.fn = () => Promise.resolve({ claims: () => undefined });
      const error = await signIn().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(GoogleRejectedError);
      expect((error as GoogleRejectedError).detail).toBe(
        'no ID token in the response',
      );
    } finally {
      grantOverride.fn = null;
    }
  });
});
