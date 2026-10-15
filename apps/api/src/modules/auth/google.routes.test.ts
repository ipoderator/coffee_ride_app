import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  authIdentities,
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
  users,
} from 'db/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { loadEnv, type Env } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';
import {
  createFakeGoogle,
  FAKE_GOOGLE_CLIENT_ID,
  FAKE_GOOGLE_CLIENT_SECRET,
  type FakeGoogleUser,
  type IssueOptions,
} from '../../test-support/fake-google.js';
import { createGoogleOidcClient } from './google-client.js';
import {
  OAUTH_TRANSACTION_TTL_MS,
  sealOAuthTransaction,
} from './oauth-transaction.js';
import {
  OAuthSignInError,
  signInWithOAuth,
  type OAuthIdentity,
} from './oauth-sign-in.service.js';
import { hashPassword } from './password.js';
import * as password from './password.js';
import { CONSENTS } from '../../test-support/legal.js';

// CR-247 (ADR-034): Google sign-in end to end against a real Postgres, with Google
// itself played by `test-support/fake-google.ts` (real PKCE, real RS256 ID tokens).

vi.mock('./password.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./password.js')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const WEB_ORIGIN = 'http://localhost:3000';
const AUTH_SECRET = 'a-test-only-secret';
const CALLBACK = '/v1/auth/google/callback';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET,
  DATABASE_URL: getTestDatabaseUrl(),
  WEB_ORIGIN,
  GOOGLE_CLIENT_ID: FAKE_GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: FAKE_GOOGLE_CLIENT_SECRET,
  // Every test signs in at least once; the per-IP tier has its own test below.
  AUTH_RATE_LIMIT_MAX: '1000',
});

let app: FastifyInstance;
let google: ReturnType<typeof createFakeGoogle>;

async function startApp(env: Env = testEnv) {
  app = await buildApp(env);
  google = createFakeGoogle();
  if (env.GOOGLE_CLIENT_ID) {
    app.googleOidc = createGoogleOidcClient({
      clientId: FAKE_GOOGLE_CLIENT_ID,
      clientSecret: FAKE_GOOGLE_CLIENT_SECRET,
      fetchImpl: google.fetchImpl,
    });
  }
}

beforeEach(async () => {
  await startApp();
  await app.db.execute(sql`DELETE FROM users`);
});

afterEach(async () => {
  await app.close();
});

function googleUser(overrides: Partial<FakeGoogleUser> = {}): FakeGoogleUser {
  return {
    sub: `1${Math.floor(Math.random() * 1e15)}`,
    email: `${randomUUID()}@gmail.test`,
    email_verified: true,
    given_name: 'Анна',
    family_name: 'Велосипедова',
    ...overrides,
  };
}

function cookieHeader(response: {
  cookies: Array<{ name: string; value: string }>;
}) {
  return response.cookies
    .filter((c) => c.value !== '')
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

async function start(next?: string) {
  const response = await app.inject({
    method: 'GET',
    url: '/v1/auth/google',
    query: next === undefined ? {} : { next },
  });
  return { response, location: String(response.headers.location) };
}

/** The whole round trip: start → consent at "Google" → callback. */
async function signIn(
  user: FakeGoogleUser,
  {
    next,
    options,
    tamperQuery,
    acceptConsent = true,
  }: {
    next?: string;
    options?: IssueOptions;
    tamperQuery?: (query: URLSearchParams) => void;
    // CR-268: a new person's callback stops at `/register/consent`; by default
    // the helper accepts the documents there, as the page would. `false` keeps
    // the callback's own answer.
    acceptConsent?: boolean;
  } = {},
) {
  const started = await start(next);
  const query = google.consent(started.location, user, options);
  tamperQuery?.(query);
  const callback = await app.inject({
    method: 'GET',
    url: `${CALLBACK}?${query.toString()}`,
    headers: { cookie: cookieHeader(started.response) },
  });
  const location = String(callback.headers.location);
  if (!acceptConsent || location !== `${WEB_ORIGIN}/register/consent`) {
    return { started, callback, location, completion: null };
  }
  const completion = await app.inject({
    method: 'POST',
    url: '/v1/auth/oauth-signup',
    headers: { cookie: cookieHeader(callback), origin: WEB_ORIGIN },
    payload: { consents: CONSENTS },
  });
  return {
    started,
    callback,
    completion,
    location:
      completion.statusCode === 200
        ? `${WEB_ORIGIN}${completion.json().next}`
        : location,
  };
}

async function userByEmail(email: string) {
  const [row] = await app.db.select().from(users).where(eq(users.email, email));
  return row;
}

async function identityCount() {
  const rows = await app.db.select().from(authIdentities);
  return rows.length;
}

async function sessionCount() {
  const rows = await app.db.select().from(sessions);
  return rows.length;
}

describe('GET /v1/auth/google', () => {
  it('redirects to Google with PKCE S256, state, nonce and the three scopes', async () => {
    const { response, location } = await start('/rides/abc');

    expect(response.statusCode).toBe(303);
    expect(response.headers['cache-control']).toBe('no-store');
    const url = new URL(location);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    const params = url.searchParams;
    expect(params.get('client_id')).toBe(FAKE_GOOGLE_CLIENT_ID);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('scope')).toBe('openid email profile');
    expect(params.get('redirect_uri')).toBe(
      `${WEB_ORIGIN}/api/v1/auth/google/callback`,
    );
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(params.get('state')).toMatch(/^[\w-]{43}$/);
    expect(params.get('nonce')).toMatch(/^[\w-]{43}$/);
    // The secret never travels through the browser.
    expect(location).not.toContain(FAKE_GOOGLE_CLIENT_SECRET);
  });

  it('sets a short-lived httpOnly SameSite=Lax transaction cookie', async () => {
    const { response } = await start();
    const cookie = response.cookies.find((c) => c.name === 'google-oauth');

    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.path).toBe('/');
    expect(cookie?.maxAge).toBe(OAUTH_TRANSACTION_TTL_MS / 1000);
    // Plain HTTP locally: `Secure` would drop it (production test below).
    expect(cookie?.secure).toBeFalsy();
    // Nothing readable in it: the verifier and nonce are inside a signed blob, but
    // never the client secret.
    expect(cookie?.value).not.toContain(FAKE_GOOGLE_CLIENT_SECRET);
  });

  it('uses a Secure __Host- cookie in production', async () => {
    await app.close();
    await startApp({ ...testEnv, NODE_ENV: 'production' });

    const { response } = await start();
    const cookie = response.cookies.find(
      (c) => c.name === '__Host-google-oauth',
    );
    expect(cookie?.secure).toBe(true);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.path).toBe('/');
    expect(cookie?.domain).toBeUndefined();
  });

  it('sends the person back to /login?oauth=unavailable when Google is not configured', async () => {
    await app.close();
    await startApp({
      ...testEnv,
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    });

    const { response, location } = await start('/rides/abc');
    expect(response.statusCode).toBe(303);
    expect(location).toBe(
      `${WEB_ORIGIN}/login?next=%2Frides%2Fabc&oauth=unavailable`,
    );
    expect(response.cookies).toHaveLength(0);
  });
});

describe('GET /v1/auth/google/status', () => {
  it('reports whether Google sign-in is configured', async () => {
    const on = await app.inject({
      method: 'GET',
      url: '/v1/auth/google/status',
    });
    expect(on.json()).toEqual({ available: true });

    await app.close();
    await startApp({ ...testEnv, GOOGLE_CLIENT_ID: undefined });
    const off = await app.inject({
      method: 'GET',
      url: '/v1/auth/google/status',
    });
    expect(off.json()).toEqual({ available: false });
  });
});

describe('GET /v1/auth/google/callback — success', () => {
  it('creates a verified, password-less user with the Google names and signs them in', async () => {
    const user = googleUser();
    const log = vi.spyOn(app.log, 'info');
    const { callback, completion, location } = await signIn(user, {
      next: '/rides/abc?x=1',
    });

    expect(callback.statusCode).toBe(303);
    expect(location).toBe(`${WEB_ORIGIN}/rides/abc?x=1`);

    const row = await userByEmail(user.email!);
    expect(row).toMatchObject({
      emailVerified: true,
      passwordHash: null,
      firstName: 'Анна',
      lastName: 'Велосипедова',
      displayName: null,
    });
    const [identity] = await app.db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.userId, row!.id));
    expect(identity).toMatchObject({
      provider: 'google',
      providerAccountId: user.sub,
    });

    // The ordinary DB session cookie — `/me` accepts it.
    // CR-268: no session before the documents are accepted — the callback
    // only parked the identity; the consent step signs the person in.
    expect(callback.cookies.find((c) => c.name === 'session')).toBeUndefined();
    const session = completion!.cookies.find((c) => c.name === 'session');
    expect(session?.httpOnly).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `session=${session!.value}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(user.email);
    // CR-260: the audit line reaches the app log — the route's request log drops
    // `info`, which silently lost it since CR-256.
    expect(log).toHaveBeenCalledWith(
      {
        authEvent: 'google_sign_in',
        userId: row!.id,
        reqId: expect.any(String),
      },
      'Auth event',
    );
  });

  it('clears the transaction cookie and stores no Google token anywhere', async () => {
    const user = googleUser();
    const { callback } = await signIn(user);

    const cleared = callback.cookies.find((c) => c.name === 'google-oauth');
    expect(cleared?.value).toBe('');
    expect(cleared?.maxAge).toBe(0);

    const dump = JSON.stringify(
      await app.db.execute(
        sql`SELECT row_to_json(u)::text AS u FROM users u UNION ALL SELECT row_to_json(i)::text FROM auth_identities i`,
      ),
    );
    expect(dump).not.toContain('ya29.');
    expect(dump).not.toContain('eyJ');
  });

  it('lands on /me without a next, and drops an unsafe next', async () => {
    const first = await signIn(googleUser());
    expect(first.location).toBe(`${WEB_ORIGIN}/me`);

    for (const unsafe of [
      '//evil.example/x',
      'https://evil.example',
      '/login',
    ]) {
      const { started, location } = await signIn(googleUser(), {
        next: unsafe,
      });
      expect(location).toBe(`${WEB_ORIGIN}/me`);
      // It never reaches the cookie either.
      expect(started.response.statusCode).toBe(303);
    }
  });

  it('signs a returning user in by Google id, even after their Google email changed', async () => {
    const user = googleUser();
    await signIn(user);
    const original = await userByEmail(user.email!);

    const { location } = await signIn({
      ...user,
      email: `${randomUUID()}@gmail.test`,
    });
    expect(location).toBe(`${WEB_ORIGIN}/me`);
    const rows = await app.db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(original!.id);
    expect(await identityCount()).toBe(1);
  });

  it('links an existing verified account, filling only its empty name fields', async () => {
    const email = `${randomUUID()}@gmail.test`;
    const passwordHash = await hashPassword('a-strong-password-123');
    await app.db.insert(users).values({
      email,
      passwordHash,
      emailVerified: true,
      firstName: 'Аня',
    });

    const { location } = await signIn(
      googleUser({ email: email.toUpperCase() }),
    );
    expect(location).toBe(`${WEB_ORIGIN}/me`);

    const row = await userByEmail(email);
    expect(row).toMatchObject({
      firstName: 'Аня',
      lastName: 'Велосипедова',
      passwordHash,
    });
    expect(await identityCount()).toBe(1);

    // The password keeps working beside Google.
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'a-strong-password-123' },
    });
    expect(login.statusCode).toBe(200);
  });
});

describe('GET /v1/auth/google/callback — refusals', () => {
  async function expectRefused(
    callback: Awaited<ReturnType<typeof signIn>>,
    outcome: string,
    next = '/rides/abc',
  ) {
    expect(callback.callback.statusCode).toBe(303);
    expect(callback.location).toBe(
      `${WEB_ORIGIN}/login?next=${encodeURIComponent(next)}&oauth=${outcome}`,
    );
    expect(
      callback.callback.cookies.find((c) => c.name === 'session'),
    ).toBeUndefined();
    expect(await sessionCount()).toBe(0);
  }

  it('refuses a callback without the transaction cookie (expired)', async () => {
    const started = await start('/rides/abc');
    const query = google.consent(started.location, googleUser());
    const callback = await app.inject({
      method: 'GET',
      url: `${CALLBACK}?${query.toString()}`,
    });
    expect(callback.statusCode).toBe(303);
    expect(String(callback.headers.location)).toBe(
      `${WEB_ORIGIN}/login?oauth=expired`,
    );
    expect(google.requests).toHaveLength(0);
  });

  it('refuses a tampered or expired transaction cookie', async () => {
    const started = await start('/rides/abc');
    const query = google.consent(started.location, googleUser());
    const original = started.response.cookies.find(
      (c) => c.name === 'google-oauth',
    )!;

    const [body, signature] = original.value.split('.');
    const forged = `${body}x.${signature}`;
    const stale = sealOAuthTransaction(
      AUTH_SECRET,
      'google',
      {
        state: query.get('state')!,
        nonce: 'n',
        codeVerifier: 'v',
        next: '/rides/abc',
      },
      new Date(Date.now() - OAUTH_TRANSACTION_TTL_MS - 1000),
    );
    const otherKey = sealOAuthTransaction('another-secret', 'google', {
      state: query.get('state')!,
      nonce: 'n',
      codeVerifier: 'v',
      next: null,
    });

    for (const value of [forged, stale, otherKey, 'garbage']) {
      const callback = await app.inject({
        method: 'GET',
        url: `${CALLBACK}?${query.toString()}`,
        headers: { cookie: `google-oauth=${value}` },
      });
      expect(String(callback.headers.location)).toBe(
        `${WEB_ORIGIN}/login?oauth=expired`,
      );
    }
    expect(google.requests).toHaveLength(0);
    expect(await userByEmail('nobody')).toBeUndefined();
  });

  it('refuses a state that does not match the cookie, before calling Google', async () => {
    const result = await signIn(googleUser(), {
      next: '/rides/abc',
      tamperQuery: (q) => q.set('state', 'attacker-state'),
    });
    await expectRefused(result, 'state');
    expect(google.requests).toHaveLength(0);

    const missing = await signIn(googleUser(), {
      next: '/rides/abc',
      tamperQuery: (q) => q.delete('state'),
    });
    await expectRefused(missing, 'state');
  });

  it('reports a declined consent as cancelled', async () => {
    const result = await signIn(googleUser(), {
      next: '/rides/abc',
      tamperQuery: (q) => {
        q.delete('code');
        q.set('error', 'access_denied');
      },
    });
    await expectRefused(result, 'cancelled');
  });

  it.each<[string, IssueOptions]>([
    ['a nonce mismatch', { idToken: { nonce: 'another-nonce' } }],
    [
      'a foreign audience',
      { idToken: { aud: 'someone-else.apps.googleusercontent.com' } },
    ],
    ['a foreign issuer', { idToken: { iss: 'https://evil.example' } }],
    ['an expired ID token', { idToken: { expiresInSeconds: -3600 } }],
    ['a bad signature', { idToken: { signWithForeignKey: true } }],
    ['no ID token', { idToken: { omit: true } }],
    ['a refused code', { tokenEndpoint: 'invalid_grant' }],
  ])('refuses %s as failed and creates nothing', async (_label, options) => {
    const result = await signIn(googleUser(), { next: '/rides/abc', options });
    await expectRefused(result, 'failed');
    expect(await app.db.select().from(users)).toHaveLength(0);
    expect(await identityCount()).toBe(0);
  });

  it('refuses a replayed callback: the code is spent and the cookie gone', async () => {
    const user = googleUser();
    const started = await start('/rides/abc');
    const query = google.consent(started.location, user);
    const request = {
      method: 'GET' as const,
      url: `${CALLBACK}?${query.toString()}`,
      headers: { cookie: cookieHeader(started.response) },
    };
    expect((await app.inject(request)).statusCode).toBe(303);
    const sessionsAfterFirst = await sessionCount();

    const replay = await app.inject(request);
    expect(String(replay.headers.location)).toBe(
      `${WEB_ORIGIN}/login?next=%2Frides%2Fabc&oauth=failed`,
    );
    expect(await sessionCount()).toBe(sessionsAfterFirst);
  });

  it('maps an unreachable Google to unavailable', async () => {
    const result = await signIn(googleUser(), {
      next: '/rides/abc',
      options: { tokenEndpoint: 'unavailable' },
    });
    await expectRefused(result, 'unavailable');
  });

  it('refuses an address Google did not verify', async () => {
    const result = await signIn(googleUser({ email_verified: false }), {
      next: '/rides/abc',
    });
    await expectRefused(result, 'email_unverified');
    expect(await app.db.select().from(users)).toHaveLength(0);
  });

  // CR-249 (ADR-035): Google's verification claims an account that never confirmed
  // its email; whatever a pre-hijacker set up before that is voided.
  it('claims an existing account whose email was never confirmed', async () => {
    const email = `${randomUUID()}@gmail.test`;
    const [squatter] = await app.db
      .insert(users)
      .values({
        email,
        passwordHash: await hashPassword('a-strong-password-123'),
        emailVerified: false,
      })
      .returning();
    const squatterLogin = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'a-strong-password-123' },
    });
    expect(squatterLogin.statusCode).toBe(200);
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    await app.db
      .insert(passwordResetTokens)
      .values({ userId: squatter!.id, tokenHash: 'reset-hash', expiresAt });
    await app.db
      .insert(emailVerificationTokens)
      .values({ userId: squatter!.id, tokenHash: 'verify-hash', expiresAt });

    const { location } = await signIn(googleUser({ email }), {
      next: '/rides/abc',
    });
    expect(location).toBe(`${WEB_ORIGIN}/rides/abc`);

    const row = await userByEmail(email);
    expect(row).toMatchObject({
      id: squatter!.id,
      emailVerified: true,
      passwordHash: null,
    });
    expect(await identityCount()).toBe(1);
    // Only the Google sign-in's own session is left.
    expect(
      await app.db
        .select()
        .from(sessions)
        .where(eq(sessions.userId, squatter!.id)),
    ).toHaveLength(1);
    const [reset] = await app.db
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.userId, squatter!.id));
    const [verify] = await app.db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.userId, squatter!.id));
    expect(reset?.usedAt).not.toBeNull();
    expect(verify?.usedAt).not.toBeNull();

    // The old password no longer works.
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'a-strong-password-123' },
    });
    expect(login.statusCode).toBe(401);
  });

  it('refuses a blocked account even when its email was never confirmed', async () => {
    const email = `${randomUUID()}@gmail.test`;
    await app.db.insert(users).values({
      email,
      passwordHash: await hashPassword('a-strong-password-123'),
      emailVerified: false,
      blockedAt: new Date(),
      blockReason: 'spam',
    });

    await expectRefused(
      await signIn(googleUser({ email }), { next: '/rides/abc' }),
      'blocked',
    );
    expect(await identityCount()).toBe(0);
    expect((await userByEmail(email))?.emailVerified).toBe(false);
  });

  it('refuses a blocked account, linked or not', async () => {
    const user = googleUser();
    await signIn(user);
    const row = await userByEmail(user.email!);
    await app.db
      .update(users)
      .set({ blockedAt: new Date(), blockReason: 'spam' })
      .where(eq(users.id, row!.id));
    await app.db.delete(sessions);

    await expectRefused(await signIn(user, { next: '/rides/abc' }), 'blocked');
    await expectRefused(
      await signIn(googleUser({ email: user.email }), { next: '/rides/abc' }),
      'blocked',
    );
  });
});

describe('password login of a Google-only account', () => {
  it('answers the generic invalid_credentials after the same Argon2 verify', async () => {
    const user = googleUser();
    await signIn(user);
    const verify = vi.mocked(password.verifyPassword);
    verify.mockClear();

    const googleOnly = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: user.email, password: 'a-strong-password-123' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: `${randomUUID()}@gmail.test`,
        password: 'a-strong-password-123',
      },
    });

    expect(googleOnly.statusCode).toBe(401);
    expect(googleOnly.json()).toEqual(unknown.json());
    expect(googleOnly.json().code).toBe('invalid_credentials');
    // One real Argon2id verify (against the decoy hash) on both paths.
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[0]![0]).toMatch(/^\$argon2id\$/);
    expect(verify.mock.calls[0]![0]).toBe(verify.mock.calls[1]![0]);
  });
});

describe('signInWithOAuth (Google) — concurrency', () => {
  const identity = (overrides: Partial<OAuthIdentity> = {}) => ({
    accountId: `1${Math.floor(Math.random() * 1e15)}`,
    email: `${randomUUID()}@gmail.test`,
    emailVerified: true,
    givenName: 'Анна',
    familyName: null,
    ...overrides,
  });

  it('parallel first sign-ins of one Google account end in one user and one identity', async () => {
    const person = identity();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        signInWithOAuth(app.db, 'google', person),
      ),
    );

    expect(new Set(results.map((r) => r.userId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await app.db.select().from(users)).toHaveLength(1);
    expect(await identityCount()).toBe(1);
  });

  it('parallel links of an existing verified account add exactly one identity', async () => {
    const person = identity();
    await app.db.insert(users).values({
      email: person.email!,
      passwordHash: await hashPassword('a-strong-password-123'),
      emailVerified: true,
    });

    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        signInWithOAuth(app.db, 'google', person),
      ),
    );
    expect(results.every((r) => !r.created)).toBe(true);
    expect(await identityCount()).toBe(1);
  });

  it('a password registration racing a Google sign-in leaves one consistent account', async () => {
    const person = identity();
    const [registration, google] = await Promise.allSettled([
      app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: {
          consents: CONSENTS,
          email: person.email,
          password: 'a-strong-password-123',
        },
      }),
      signInWithOAuth(app.db, 'google', person),
    ]);

    const rows = await app.db.select().from(users);
    expect(rows).toHaveLength(1);
    // CR-262 (ADR-039): `/register` answers 201 whoever won, so the winner is read
    // from the account itself.
    expect(registration.status).toBe('fulfilled');
    expect(
      (registration as PromiseFulfilledResult<{ statusCode: number }>).value
        .statusCode,
    ).toBe(201);
    const registered = rows[0]!.passwordHash !== null;
    if (registered) {
      // The password account won: unverified, so Google must not have linked it.
      expect(google.status).toBe('rejected');
      expect((google as PromiseRejectedResult).reason).toBeInstanceOf(
        OAuthSignInError,
      );
      expect(await identityCount()).toBe(0);
    } else {
      expect(google.status).toBe('fulfilled');
      expect(rows[0]).toMatchObject({
        emailVerified: true,
        passwordHash: null,
      });
      expect(await identityCount()).toBe(1);
    }
  });
});

// The parallel tests above can finish one transaction before the next one opens a
// connection; these hold a competing transaction open at the exact point of the
// race, so the `ON CONFLICT DO NOTHING` paths provably run.
describe('signInWithOAuth (Google) — held races', () => {
  type Tx = Parameters<Parameters<FastifyInstance['db']['transaction']>[0]>[0];

  /** Runs `write` in a transaction that stays open until `commit()` is called. */
  function holdTransaction(write: (tx: Tx) => Promise<void>) {
    let commit!: () => void;
    const released = new Promise<void>((resolve) => (commit = resolve));
    let ready!: () => void;
    const written = new Promise<void>((resolve) => (ready = resolve));
    const done = app.db.transaction(async (tx) => {
      await write(tx);
      ready();
      await released;
    });
    return { written, commit, done };
  }

  // Long enough for the sign-in to reach the statement that waits on the lock.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

  const identity = (email: string) => ({
    accountId: `1${Math.floor(Math.random() * 1e15)}`,
    email,
    emailVerified: true,
    givenName: 'Анна',
    familyName: 'Велосипедова',
  });

  it('links to the account a concurrent Google sign-in creates while it waits', async () => {
    const email = `${randomUUID()}@gmail.test`;
    const held = holdTransaction(async (tx) => {
      await tx
        .insert(users)
        .values({ email, passwordHash: null, emailVerified: true });
    });
    await held.written;

    const pending = signInWithOAuth(app.db, 'google', identity(email));
    await settle();
    held.commit();
    await held.done;

    const result = await pending;
    expect(result.created).toBe(false);
    expect(result.userId).toBe((await userByEmail(email))!.id);
    expect(await identityCount()).toBe(1);
  });

  it('claims the account a password registration commits first, unverified', async () => {
    const email = `${randomUUID()}@gmail.test`;
    const held = holdTransaction(async (tx) => {
      await tx.insert(users).values({
        email,
        passwordHash: await hashPassword('a-strong-password-123'),
        emailVerified: false,
      });
    });
    await held.written;

    const pending = signInWithOAuth(app.db, 'google', identity(email));
    await settle();
    held.commit();
    await held.done;

    const result = await pending;
    expect(result.created).toBe(false);
    expect(await userByEmail(email)).toMatchObject({
      id: result.userId,
      emailVerified: true,
      passwordHash: null,
    });
    expect(await identityCount()).toBe(1);
  });

  it('accepts the identity a concurrent callback linked to the same user', async () => {
    const email = `${randomUUID()}@gmail.test`;
    const [user] = await app.db
      .insert(users)
      .values({ email, passwordHash: null, emailVerified: true })
      .returning();
    const person = identity(email);
    const held = holdTransaction(async (tx) => {
      await tx.insert(authIdentities).values({
        userId: user!.id,
        provider: 'google',
        providerAccountId: person.accountId,
      });
    });
    await held.written;

    const pending = signInWithOAuth(app.db, 'google', person);
    await settle();
    held.commit();
    await held.done;

    expect((await pending).userId).toBe(user!.id);
    expect(await identityCount()).toBe(1);
  });

  it('refuses when the same Google account is concurrently linked to another user', async () => {
    const [mine, other] = await app.db
      .insert(users)
      .values([
        {
          email: `${randomUUID()}@gmail.test`,
          passwordHash: null,
          emailVerified: true,
        },
        {
          email: `${randomUUID()}@gmail.test`,
          passwordHash: null,
          emailVerified: true,
        },
      ])
      .returning();
    const person = identity(mine!.email);
    const held = holdTransaction(async (tx) => {
      await tx.insert(authIdentities).values({
        userId: other!.id,
        provider: 'google',
        providerAccountId: person.accountId,
      });
    });
    await held.written;

    const pending = signInWithOAuth(app.db, 'google', person).catch(
      (e: unknown) => e,
    );
    await settle();
    held.commit();
    await held.done;

    const error = await pending;
    expect(error).toBeInstanceOf(OAuthSignInError);
    expect((error as OAuthSignInError).reason).toBe('conflict');
  });
});

describe('GET /v1/auth/google/callback — unexpected failure', () => {
  it('reports it and still lands on /login with failed', async () => {
    const real = app.googleOidc!;
    app.googleOidc = {
      authorizationUrl: real.authorizationUrl,
      completeSignIn: () => Promise.reject(new RangeError('unexpected')),
    };
    const report = vi.spyOn(app, 'reportError');

    const { location } = await signIn(googleUser(), { next: '/rides/abc' });
    expect(location).toBe(
      `${WEB_ORIGIN}/login?next=%2Frides%2Fabc&oauth=failed`,
    );
    expect(report).toHaveBeenCalledOnce();
    expect(await sessionCount()).toBe(0);
  });
});

describe('Google sign-in rate limit', () => {
  it('has its own per-IP tier on the start route', async () => {
    await app.close();
    await startApp({ ...testEnv, AUTH_RATE_LIMIT_MAX: 2 });
    const codes = [];
    for (let i = 0; i < 3; i += 1)
      codes.push((await start()).response.statusCode);
    expect(codes).toEqual([303, 303, 429]);
  });
});
