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
} from '../../test-support/fake-google.js';
import {
  createFakeYandex,
  FAKE_YANDEX_CLIENT_ID,
  FAKE_YANDEX_CLIENT_SECRET,
  FAKE_YANDEX_TOKEN_PREFIX,
  type FakeYandexUser,
  type YandexIssueOptions,
} from '../../test-support/fake-yandex.js';
import { createGoogleOidcClient } from './google-client.js';
import {
  OAUTH_TRANSACTION_TTL_MS,
  sealOAuthTransaction,
} from './oauth-transaction.js';
import { OAuthSignInError, signInWithOAuth } from './oauth-sign-in.service.js';
import * as password from './password.js';
import { hashPassword } from './password.js';
import { createYandexOAuthClient } from './yandex-client.js';

// CR-260 (ADR-037): Yandex ID sign-in end to end against a real Postgres, with Yandex
// itself played by `test-support/fake-yandex.ts` (real PKCE, single-use codes). The
// account rules are `signInWithOAuth`'s, shared with Google — their full race suite
// lives in `google.routes.test.ts`; here they are proven for `provider = 'yandex'`.

vi.mock('./password.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./password.js')>();
  return { ...actual, verifyPassword: vi.fn(actual.verifyPassword) };
});

const WEB_ORIGIN = 'http://localhost:3000';
const AUTH_SECRET = 'a-test-only-secret';
const CALLBACK = '/v1/auth/yandex/callback';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET,
  DATABASE_URL: getTestDatabaseUrl(),
  WEB_ORIGIN,
  YANDEX_CLIENT_ID: FAKE_YANDEX_CLIENT_ID,
  YANDEX_CLIENT_SECRET: FAKE_YANDEX_CLIENT_SECRET,
  GOOGLE_CLIENT_ID: FAKE_GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: FAKE_GOOGLE_CLIENT_SECRET,
  // Every test signs in at least once; the per-IP tier has its own test below.
  AUTH_RATE_LIMIT_MAX: '1000',
});

let app: FastifyInstance;
let yandex: ReturnType<typeof createFakeYandex>;

async function startApp(env: Env = testEnv) {
  app = await buildApp(env);
  yandex = createFakeYandex();
  if (env.YANDEX_CLIENT_ID && env.YANDEX_CLIENT_SECRET) {
    app.yandexOAuth = createYandexOAuthClient({
      clientId: FAKE_YANDEX_CLIENT_ID,
      clientSecret: FAKE_YANDEX_CLIENT_SECRET,
      fetchImpl: yandex.fetchImpl,
    });
  }
}

beforeEach(async () => {
  await startApp();
  // CR-267: rides first — another file in this worker may have left some,
  // and `rides.organizer_id` blocks deleting their organizers' users.
  await app.db.execute(sql`DELETE FROM rides`);
  await app.db.execute(sql`DELETE FROM users`);
});

afterEach(async () => {
  await app.close();
});

function yandexUser(overrides: Partial<FakeYandexUser> = {}): FakeYandexUser {
  return {
    id: `11300000${Math.floor(Math.random() * 1e8)}`,
    default_email: `${randomUUID()}@yandex.test`,
    first_name: 'Анна',
    last_name: 'Велосипедова',
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
    url: '/v1/auth/yandex',
    query: next === undefined ? {} : { next },
  });
  return { response, location: String(response.headers.location) };
}

/** The whole round trip: start → consent at "Yandex" → callback. */
async function signIn(
  user: FakeYandexUser,
  {
    next,
    options,
    tamperQuery,
  }: {
    next?: string;
    options?: YandexIssueOptions;
    tamperQuery?: (query: URLSearchParams) => void;
  } = {},
) {
  const started = await start(next);
  const query = yandex.consent(started.location, user, options);
  tamperQuery?.(query);
  const callback = await app.inject({
    method: 'GET',
    url: `${CALLBACK}?${query.toString()}`,
    headers: { cookie: cookieHeader(started.response) },
  });
  return { started, callback, location: String(callback.headers.location) };
}

async function userByEmail(email: string) {
  const [row] = await app.db.select().from(users).where(eq(users.email, email));
  return row;
}

async function identities() {
  return app.db.select().from(authIdentities);
}

async function sessionCount() {
  const rows = await app.db.select().from(sessions);
  return rows.length;
}

describe('GET /v1/auth/yandex', () => {
  it('redirects to Yandex ID with PKCE S256, state and login:info login:email', async () => {
    const { response, location } = await start('/rides/abc');

    expect(response.statusCode).toBe(303);
    expect(response.headers['cache-control']).toBe('no-store');
    const url = new URL(location);
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://oauth.yandex.ru/authorize',
    );
    const params = url.searchParams;
    expect(params.get('client_id')).toBe(FAKE_YANDEX_CLIENT_ID);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('scope')).toBe('login:info login:email');
    expect(params.get('redirect_uri')).toBe(
      `${WEB_ORIGIN}/api/v1/auth/yandex/callback`,
    );
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toMatch(/^[\w-]{43}$/);
    expect(params.get('state')).toMatch(/^[\w-]{43}$/);
    expect(location).not.toContain(FAKE_YANDEX_CLIENT_SECRET);
  });

  it('sets a short-lived httpOnly SameSite=Lax transaction cookie', async () => {
    const { response } = await start();
    const cookie = response.cookies.find((c) => c.name === 'yandex-oauth');

    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.path).toBe('/');
    expect(cookie?.maxAge).toBe(OAUTH_TRANSACTION_TTL_MS / 1000);
    expect(cookie?.secure).toBeFalsy();
    expect(cookie?.value).not.toContain(FAKE_YANDEX_CLIENT_SECRET);
  });

  it('uses a Secure __Host- cookie in production, also when clearing it', async () => {
    await app.close();
    await startApp({ ...testEnv, NODE_ENV: 'production' });

    const { callback, started } = await signIn(yandexUser());
    const set = started.response.cookies.find(
      (c) => c.name === '__Host-yandex-oauth',
    );
    expect(set).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
    });
    expect(set?.domain).toBeUndefined();
    const cleared = callback.cookies.find(
      (c) => c.name === '__Host-yandex-oauth',
    );
    expect(cleared).toMatchObject({ value: '', secure: true, path: '/' });
    // CR-264: the session it ends in is the ordinary production cookie.
    const session = callback.cookies.find((c) => c.name === '__Host-session');
    expect(session).toMatchObject({
      secure: true,
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
    });
    expect(session?.domain).toBeUndefined();
  });

  it('sends the person back to /login with provider=yandex when Yandex is not configured', async () => {
    await app.close();
    await startApp({
      ...testEnv,
      YANDEX_CLIENT_ID: undefined,
      YANDEX_CLIENT_SECRET: undefined,
    });

    const { response, location } = await start('/rides/abc');
    expect(response.statusCode).toBe(303);
    expect(location).toBe(
      `${WEB_ORIGIN}/login?next=%2Frides%2Fabc&oauth=unavailable&provider=yandex`,
    );
    expect(response.cookies).toHaveLength(0);

    const callback = await app.inject({
      method: 'GET',
      url: `${CALLBACK}?code=c&state=s`,
    });
    expect(String(callback.headers.location)).toBe(
      `${WEB_ORIGIN}/login?oauth=unavailable&provider=yandex`,
    );
  });
});

describe('GET /v1/auth/yandex/status', () => {
  it('reports whether Yandex sign-in is configured', async () => {
    const on = await app.inject({
      method: 'GET',
      url: '/v1/auth/yandex/status',
    });
    expect(on.json()).toEqual({ available: true });

    await app.close();
    await startApp({ ...testEnv, YANDEX_CLIENT_SECRET: undefined });
    const off = await app.inject({
      method: 'GET',
      url: '/v1/auth/yandex/status',
    });
    expect(off.json()).toEqual({ available: false });
  });
});

describe('GET /v1/auth/yandex/callback — success', () => {
  it('creates a verified, password-less user with the Yandex names and signs them in', async () => {
    const user = yandexUser();
    const log = vi.spyOn(app.log, 'info');
    const { callback, location } = await signIn(user, {
      next: '/rides/abc?x=1',
    });

    expect(callback.statusCode).toBe(303);
    expect(location).toBe(`${WEB_ORIGIN}/rides/abc?x=1`);

    const row = await userByEmail(user.default_email!);
    expect(row).toMatchObject({
      emailVerified: true,
      passwordHash: null,
      firstName: 'Анна',
      lastName: 'Велосипедова',
    });
    expect(await identities()).toEqual([
      expect.objectContaining({
        userId: row!.id,
        provider: 'yandex',
        providerAccountId: String(user.id),
      }),
    ]);

    const session = callback.cookies.find((c) => c.name === 'session');
    expect(session?.httpOnly).toBe(true);
    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `session=${session!.value}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe(user.default_email);
    // The audit line reaches the app log (the route's request log drops `info`),
    // and nothing about the sign-in beyond the user id does.
    expect(log).toHaveBeenCalledWith(
      {
        authEvent: 'yandex_sign_in',
        userId: row!.id,
        reqId: expect.any(String),
      },
      'Auth event',
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain(user.default_email);
  });

  it('clears the transaction cookie and stores no Yandex token anywhere', async () => {
    const { callback } = await signIn(yandexUser());

    const cleared = callback.cookies.find((c) => c.name === 'yandex-oauth');
    expect(cleared?.value).toBe('');
    expect(cleared?.maxAge).toBe(0);

    const dump = JSON.stringify(
      await app.db.execute(
        sql`SELECT row_to_json(u)::text AS u FROM users u UNION ALL SELECT row_to_json(i)::text FROM auth_identities i UNION ALL SELECT row_to_json(s)::text FROM sessions s`,
      ),
    );
    expect(dump).not.toContain(FAKE_YANDEX_TOKEN_PREFIX);
    expect(dump).not.toContain('fake-refresh');
  });

  it('lands on /me without a next, and drops an unsafe next', async () => {
    expect((await signIn(yandexUser())).location).toBe(`${WEB_ORIGIN}/me`);
    for (const unsafe of [
      '//evil.example/x',
      'https://evil.example',
      '/\\evil.example',
      '/login',
    ]) {
      const { location } = await signIn(yandexUser(), { next: unsafe });
      expect(location).toBe(`${WEB_ORIGIN}/me`);
    }
  });

  it('signs a returning user in by Yandex id, even after their email changed', async () => {
    const user = yandexUser();
    await signIn(user);
    const original = await userByEmail(user.default_email!);

    const { location } = await signIn({
      ...user,
      default_email: `${randomUUID()}@yandex.test`,
    });
    expect(location).toBe(`${WEB_ORIGIN}/me`);
    const rows = await app.db.select().from(users);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(original!.id);
    expect(await identities()).toHaveLength(1);
  });

  it('links an existing verified account, keeping its password and filled names', async () => {
    const email = `${randomUUID()}@yandex.test`;
    const passwordHash = await hashPassword('a-strong-password-123');
    await app.db.insert(users).values({
      email,
      passwordHash,
      emailVerified: true,
      firstName: 'Аня',
    });

    const { location } = await signIn(
      yandexUser({ default_email: email.toUpperCase() }),
    );
    expect(location).toBe(`${WEB_ORIGIN}/me`);
    expect(await userByEmail(email)).toMatchObject({
      firstName: 'Аня',
      lastName: 'Велосипедова',
      passwordHash,
    });
    expect(await identities()).toHaveLength(1);
  });

  it('adds Yandex next to Google on one account found by the same email', async () => {
    const google = createFakeGoogle();
    app.googleOidc = createGoogleOidcClient({
      clientId: FAKE_GOOGLE_CLIENT_ID,
      clientSecret: FAKE_GOOGLE_CLIENT_SECRET,
      fetchImpl: google.fetchImpl,
    });
    const email = `${randomUUID()}@gmail.test`;
    const googleStart = await app.inject({
      method: 'GET',
      url: '/v1/auth/google',
    });
    const googleQuery = google.consent(String(googleStart.headers.location), {
      sub: '1234567890',
      email,
      email_verified: true,
    });
    const googleCallback = await app.inject({
      method: 'GET',
      url: `/v1/auth/google/callback?${googleQuery.toString()}`,
      headers: { cookie: cookieHeader(googleStart) },
    });
    expect(String(googleCallback.headers.location)).toBe(`${WEB_ORIGIN}/me`);

    await signIn(yandexUser({ default_email: email }));
    expect(await app.db.select().from(users)).toHaveLength(1);
    expect((await identities()).map((i) => i.provider).sort()).toEqual([
      'google',
      'yandex',
    ]);
  });
});

describe('GET /v1/auth/yandex/callback — refusals', () => {
  async function expectRefused(
    result: Awaited<ReturnType<typeof signIn>>,
    outcome: string,
  ) {
    expect(result.callback.statusCode).toBe(303);
    expect(result.location).toBe(
      `${WEB_ORIGIN}/login?next=%2Frides%2Fabc&oauth=${outcome}&provider=yandex`,
    );
    expect(
      result.callback.cookies.find((c) => c.name === 'session'),
    ).toBeUndefined();
    expect(await sessionCount()).toBe(0);
  }

  it('refuses a callback without the transaction cookie, before calling Yandex', async () => {
    const started = await start('/rides/abc');
    const query = yandex.consent(started.location, yandexUser());
    const callback = await app.inject({
      method: 'GET',
      url: `${CALLBACK}?${query.toString()}`,
    });
    expect(String(callback.headers.location)).toBe(
      `${WEB_ORIGIN}/login?oauth=expired&provider=yandex`,
    );
    expect(yandex.requests).toHaveLength(0);
  });

  it('refuses a tampered, expired, foreign-key or Google transaction cookie', async () => {
    const started = await start('/rides/abc');
    const query = yandex.consent(started.location, yandexUser());
    const original = started.response.cookies.find(
      (c) => c.name === 'yandex-oauth',
    )!;
    const [body, signature] = original.value.split('.');
    const tx = {
      state: query.get('state')!,
      nonce: 'n',
      codeVerifier: 'v',
      next: null,
    };

    for (const value of [
      `${body}x.${signature}`,
      sealOAuthTransaction(
        AUTH_SECRET,
        'yandex',
        tx,
        new Date(Date.now() - OAUTH_TRANSACTION_TTL_MS - 1000),
      ),
      sealOAuthTransaction('another-secret', 'yandex', tx),
      // A genuine Google cookie with the matching state is still not Yandex's.
      sealOAuthTransaction(AUTH_SECRET, 'google', tx),
      'garbage',
    ]) {
      const callback = await app.inject({
        method: 'GET',
        url: `${CALLBACK}?${query.toString()}`,
        headers: { cookie: `yandex-oauth=${value}` },
      });
      expect(String(callback.headers.location)).toBe(
        `${WEB_ORIGIN}/login?oauth=expired&provider=yandex`,
      );
    }
    expect(yandex.requests).toHaveLength(0);
  });

  it('refuses a state that does not match the cookie, before calling Yandex', async () => {
    await expectRefused(
      await signIn(yandexUser(), {
        next: '/rides/abc',
        tamperQuery: (q) => q.set('state', 'attacker-state'),
      }),
      'state',
    );
    await expectRefused(
      await signIn(yandexUser(), {
        next: '/rides/abc',
        tamperQuery: (q) => q.delete('state'),
      }),
      'state',
    );
    expect(yandex.requests).toHaveLength(0);
  });

  it('reports a declined consent as cancelled, and a forged decline as state', async () => {
    const started = await start('/rides/abc');
    const declined = await app.inject({
      method: 'GET',
      url: `${CALLBACK}?${yandex.decline(started.location).toString()}`,
      headers: { cookie: cookieHeader(started.response) },
    });
    expect(String(declined.headers.location)).toBe(
      `${WEB_ORIGIN}/login?next=%2Frides%2Fabc&oauth=cancelled&provider=yandex`,
    );

    await expectRefused(
      await signIn(yandexUser(), {
        next: '/rides/abc',
        tamperQuery: (q) => {
          q.delete('code');
          q.set('error', 'access_denied');
          q.set('state', 'attacker-state');
        },
      }),
      'state',
    );
    expect(yandex.requests).toHaveLength(0);
  });

  it.each<[string, (q: URLSearchParams) => void]>([
    ['another provider error', (q) => q.set('error', 'unauthorized_client')],
    ['no code', (q) => q.delete('code')],
  ])('refuses %s as failed without calling Yandex', async (_label, tamper) => {
    await expectRefused(
      await signIn(yandexUser(), { next: '/rides/abc', tamperQuery: tamper }),
      'failed',
    );
    expect(yandex.requests).toHaveLength(0);
  });

  it.each<[string, YandexIssueOptions]>([
    ['a refused code', { tokenEndpoint: 'invalid_grant' }],
    ['a refused access token', { profile: 'unauthorized' }],
    ['a token issued to another app', { profile: 'foreign_client' }],
  ])('refuses %s as failed and creates nothing', async (_label, options) => {
    await expectRefused(
      await signIn(yandexUser(), { next: '/rides/abc', options }),
      'failed',
    );
    expect(await app.db.select().from(users)).toHaveLength(0);
    expect(await identities()).toHaveLength(0);
  });

  it('refuses a replayed callback: the code is spent and the cookie gone', async () => {
    const started = await start('/rides/abc');
    const query = yandex.consent(started.location, yandexUser());
    const request = {
      method: 'GET' as const,
      url: `${CALLBACK}?${query.toString()}`,
      headers: { cookie: cookieHeader(started.response) },
    };
    expect((await app.inject(request)).statusCode).toBe(303);
    const sessionsAfterFirst = await sessionCount();

    const replay = await app.inject(request);
    expect(String(replay.headers.location)).toBe(
      `${WEB_ORIGIN}/login?next=%2Frides%2Fabc&oauth=failed&provider=yandex`,
    );
    expect(await sessionCount()).toBe(sessionsAfterFirst);
  });

  // CR-264: a code Yandex never issued, and a real one it refuses to exchange.
  it('refuses a forged or rejected code without signing anyone in', async () => {
    await expectRefused(
      await signIn(yandexUser(), {
        next: '/rides/abc',
        tamperQuery: (query) => query.set('code', 'forged-code'),
      }),
      'failed',
    );
    await expectRefused(
      await signIn(yandexUser(), {
        next: '/rides/abc',
        options: { tokenEndpoint: 'invalid_grant' },
      }),
      'failed',
    );
    expect(await identities()).toHaveLength(0);
  });

  it('maps an unreachable Yandex to unavailable', async () => {
    await expectRefused(
      await signIn(yandexUser(), {
        next: '/rides/abc',
        options: { tokenEndpoint: 'unavailable' },
      }),
      'unavailable',
    );
  });

  it('refuses a Yandex account without an email address', async () => {
    await expectRefused(
      await signIn(yandexUser({ default_email: null }), { next: '/rides/abc' }),
      'email_unverified',
    );
    expect(await app.db.select().from(users)).toHaveLength(0);
  });

  // ADR-035 via the shared service: Yandex's address claims an account that never
  // confirmed it; whatever a pre-hijacker set up before that is voided.
  it('claims an existing account whose email was never confirmed', async () => {
    const email = `${randomUUID()}@yandex.test`;
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

    const { location } = await signIn(yandexUser({ default_email: email }), {
      next: '/rides/abc',
    });
    expect(location).toBe(`${WEB_ORIGIN}/rides/abc`);

    expect(await userByEmail(email)).toMatchObject({
      id: squatter!.id,
      emailVerified: true,
      passwordHash: null,
    });
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
  });

  it('refuses a blocked account, linked or not', async () => {
    const user = yandexUser();
    await signIn(user);
    const row = await userByEmail(user.default_email!);
    await app.db
      .update(users)
      .set({ blockedAt: new Date(), blockReason: 'spam' })
      .where(eq(users.id, row!.id));
    await app.db.delete(sessions);

    await expectRefused(await signIn(user, { next: '/rides/abc' }), 'blocked');
    await expectRefused(
      await signIn(yandexUser({ default_email: user.default_email }), {
        next: '/rides/abc',
      }),
      'blocked',
    );
  });
});

// CR-264: a person who only ever signed in with Yandex has no password to log in with.
describe('password login of a Yandex-only account', () => {
  it('answers the generic invalid_credentials after the same Argon2 verify', async () => {
    const user = yandexUser();
    await signIn(user);
    const verify = vi.mocked(password.verifyPassword);
    verify.mockClear();

    const yandexOnly = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: user.default_email!,
        password: 'a-strong-password-123',
      },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: `${randomUUID()}@yandex.test`,
        password: 'a-strong-password-123',
      },
    });

    expect(yandexOnly.statusCode).toBe(401);
    expect(yandexOnly.json()).toEqual(unknown.json());
    expect(yandexOnly.json().code).toBe('invalid_credentials');
    expect(yandexOnly.cookies).toEqual([]);
    // One real Argon2id verify (against the decoy hash) on both paths.
    expect(verify).toHaveBeenCalledTimes(2);
    expect(verify.mock.calls[0]![0]).toMatch(/^\$argon2id\$/);
    expect(verify.mock.calls[0]![0]).toBe(verify.mock.calls[1]![0]);
  });
});

describe('signInWithOAuth (Yandex) — concurrency', () => {
  const identity = (email = `${randomUUID()}@yandex.test`) => ({
    accountId: `11300000${Math.floor(Math.random() * 1e8)}`,
    email,
    emailVerified: true,
    givenName: 'Анна',
    familyName: null,
  });

  it('parallel first sign-ins of one Yandex account end in one user and one identity', async () => {
    const person = identity();
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        signInWithOAuth(app.db, 'yandex', person),
      ),
    );
    expect(new Set(results.map((r) => r.userId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await app.db.select().from(users)).toHaveLength(1);
    expect(await identities()).toHaveLength(1);
  });

  it('parallel Google and Yandex first sign-ins of one email end in one user', async () => {
    const email = `${randomUUID()}@yandex.test`;
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        signInWithOAuth(app.db, i % 2 ? 'yandex' : 'google', {
          ...identity(email),
          accountId: i % 2 ? '1130000099' : '10999',
        }),
      ),
    );
    expect(new Set(results.map((r) => r.userId)).size).toBe(1);
    expect(await app.db.select().from(users)).toHaveLength(1);
    expect((await identities()).map((i) => i.provider).sort()).toEqual([
      'google',
      'yandex',
    ]);
  });

  it('keeps one Yandex id from being linked to a second user', async () => {
    const first = await signInWithOAuth(app.db, 'yandex', identity());
    // The same Yandex id now arrives with an address of another account: the
    // linked user wins, nothing is re-pointed.
    const other = identity();
    await app.db
      .insert(users)
      .values({ email: other.email, passwordHash: null, emailVerified: true });
    const [linked] = await identities();
    const again = await signInWithOAuth(app.db, 'yandex', {
      ...other,
      accountId: linked!.providerAccountId,
    });
    expect(again.userId).toBe(first.userId);
    expect(await identities()).toHaveLength(1);
  });

  it('refuses an address the provider did not vouch for', async () => {
    await expect(
      signInWithOAuth(app.db, 'yandex', {
        ...identity(),
        emailVerified: false,
      }),
    ).rejects.toMatchObject({ provider: 'yandex', reason: 'email_unverified' });
    await expect(
      signInWithOAuth(app.db, 'yandex', { ...identity(), email: null }),
    ).rejects.toBeInstanceOf(OAuthSignInError);
  });
});

describe('GET /v1/auth/yandex/callback — unexpected failure', () => {
  it('reports it and still lands on /login with failed', async () => {
    const real = app.yandexOAuth!;
    app.yandexOAuth = {
      authorizationUrl: real.authorizationUrl,
      completeSignIn: () => Promise.reject(new RangeError('unexpected')),
    };
    const report = vi.spyOn(app, 'reportError');

    const { location } = await signIn(yandexUser(), { next: '/rides/abc' });
    expect(location).toBe(
      `${WEB_ORIGIN}/login?next=%2Frides%2Fabc&oauth=failed&provider=yandex`,
    );
    expect(report).toHaveBeenCalledOnce();
    expect(await sessionCount()).toBe(0);
  });
});

describe('Yandex sign-in rate limit', () => {
  it('has its own per-IP tier on the start route', async () => {
    await app.close();
    await startApp({ ...testEnv, AUTH_RATE_LIMIT_MAX: 2 });
    const codes = [];
    for (let i = 0; i < 3; i += 1)
      codes.push((await start()).response.statusCode);
    expect(codes).toEqual([303, 303, 429]);
  });
});
