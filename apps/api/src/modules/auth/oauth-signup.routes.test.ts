import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  authIdentities,
  legalAcceptances,
  oauthPendingSignups,
  sessions,
  users,
} from 'db/schema';
import { currentLegalVersion } from 'types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../app.js';
import { loadEnv } from '../../env.js';
import { CONSENTS } from '../../test-support/legal.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';
import {
  createFakeGoogle,
  FAKE_GOOGLE_CLIENT_ID,
  FAKE_GOOGLE_CLIENT_SECRET,
  type FakeGoogleUser,
} from '../../test-support/fake-google.js';
import {
  createFakeYandex,
  FAKE_YANDEX_CLIENT_ID,
  FAKE_YANDEX_CLIENT_SECRET,
  type FakeYandexUser,
} from '../../test-support/fake-yandex.js';
import { createGoogleOidcClient } from './google-client.js';
import { createYandexOAuthClient } from './yandex-client.js';

// CR-269 (ADR-041): a first Google/Yandex sign-in creates no account and no session
// until the person accepts the documents on `/register/consent`. Real Postgres,
// providers played by the fakes (real PKCE, real ID tokens).

const WEB_ORIGIN = 'http://localhost:3000';
const CONSENT_PAGE = `${WEB_ORIGIN}/register/consent`;
const SIGNUP = '/v1/auth/oauth-signup';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: getTestDatabaseUrl(),
  WEB_ORIGIN,
  GOOGLE_CLIENT_ID: FAKE_GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: FAKE_GOOGLE_CLIENT_SECRET,
  YANDEX_CLIENT_ID: FAKE_YANDEX_CLIENT_ID,
  YANDEX_CLIENT_SECRET: FAKE_YANDEX_CLIENT_SECRET,
  AUTH_RATE_LIMIT_MAX: '1000',
});

let app: FastifyInstance;
let google: ReturnType<typeof createFakeGoogle>;
let yandex: ReturnType<typeof createFakeYandex>;

beforeEach(async () => {
  app = await buildApp(testEnv);
  google = createFakeGoogle();
  yandex = createFakeYandex();
  app.googleOidc = createGoogleOidcClient({
    clientId: FAKE_GOOGLE_CLIENT_ID,
    clientSecret: FAKE_GOOGLE_CLIENT_SECRET,
    fetchImpl: google.fetchImpl,
  });
  app.yandexOAuth = createYandexOAuthClient({
    clientId: FAKE_YANDEX_CLIENT_ID,
    clientSecret: FAKE_YANDEX_CLIENT_SECRET,
    fetchImpl: yandex.fetchImpl,
  });
  await app.db.execute(sql`DELETE FROM users`);
  await app.db.execute(sql`DELETE FROM oauth_pending_signups`);
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

/** start → consent at Google → callback; returns the callback's reply. */
async function googleCallback(user: FakeGoogleUser, next?: string) {
  const started = await app.inject({
    method: 'GET',
    url: '/v1/auth/google',
    query: next === undefined ? {} : { next },
  });
  const query = google.consent(String(started.headers.location), user);
  const url = `/v1/auth/google/callback?${query.toString()}`;
  const cookie = cookieHeader(started);
  const callback = await app.inject({
    method: 'GET',
    url,
    headers: { cookie },
  });
  return { callback, replay: { url, cookie } };
}

async function yandexCallback(user: FakeYandexUser) {
  const started = await app.inject({ method: 'GET', url: '/v1/auth/yandex' });
  const query = yandex.consent(String(started.headers.location), user);
  return app.inject({
    method: 'GET',
    url: `/v1/auth/yandex/callback?${query.toString()}`,
    headers: { cookie: cookieHeader(started) },
  });
}

function complete(cookie: string, payload: unknown = { consents: CONSENTS }) {
  return app.inject({
    method: 'POST',
    url: SIGNUP,
    headers: { cookie, origin: WEB_ORIGIN },
    payload: payload as Record<string, unknown>,
  });
}

const count = async (table: typeof users | typeof sessions) =>
  (await app.db.select().from(table)).length;

describe('first Google sign-in — the consent step', () => {
  it('parks the identity: no user, no session, only an opaque token in the cookie', async () => {
    const user = googleUser();
    const { callback } = await googleCallback(user, '/rides/abc');

    expect(callback.statusCode).toBe(303);
    expect(callback.headers.location).toBe(CONSENT_PAGE);
    expect(callback.headers['cache-control']).toBe('no-store');
    expect(await count(users)).toBe(0);
    expect(await count(sessions)).toBe(0);
    expect(callback.cookies.find((c) => c.name === 'session')).toBeUndefined();

    const signup = callback.cookies.find((c) => c.name === 'oauth-signup');
    expect(signup).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
    });
    expect(signup!.maxAge).toBe(600);
    // Opaque: neither the address nor the provider id is in it, and the table
    // keeps only its hash.
    expect(signup!.value).toMatch(/^[0-9a-f]{64}$/);
    const [row] = await app.db.select().from(oauthPendingSignups);
    expect(row).toMatchObject({
      provider: 'google',
      providerAccountId: user.sub,
      email: user.email,
      next: '/rides/abc',
    });
    expect(row!.tokenHash).not.toBe(signup!.value);
    expect(JSON.stringify(callback.cookies)).not.toContain(user.email!);
  });

  it('shows the address to the browser holding the cookie, and nobody else', async () => {
    const user = googleUser();
    const { callback } = await googleCallback(user);

    const read = await app.inject({
      method: 'GET',
      url: SIGNUP,
      headers: { cookie: cookieHeader(callback) },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ provider: 'google', email: user.email });
    expect(read.headers['cache-control']).toBe('no-store');

    for (const cookie of ['', 'oauth-signup=forged']) {
      const denied = await app.inject({
        method: 'GET',
        url: SIGNUP,
        headers: cookie ? { cookie } : {},
      });
      expect(denied.statusCode).toBe(410);
      expect(denied.json().code).toBe('oauth_signup_expired');
    }
  });

  it('creates the account, the acceptance and the session once both documents are accepted', async () => {
    const user = googleUser();
    const { callback } = await googleCallback(user, '/rides/abc');

    const done = await complete(cookieHeader(callback));
    expect(done.statusCode).toBe(200);
    expect(done.json()).toEqual({ next: '/rides/abc' });

    const [row] = await app.db
      .select()
      .from(users)
      .where(eq(users.email, user.email!));
    expect(row).toMatchObject({
      emailVerified: true,
      passwordHash: null,
      firstName: 'Анна',
    });
    const [identity] = await app.db.select().from(authIdentities);
    expect(identity).toMatchObject({ provider: 'google', userId: row!.id });

    const accepted = await app.db
      .select()
      .from(legalAcceptances)
      .where(eq(legalAcceptances.userId, row!.id));
    expect(
      accepted
        .map((a) => [a.document, a.version, a.contentSha256, a.source])
        .sort(),
    ).toEqual(
      (['personal_data_consent', 'terms'] as const).map((document) => [
        document,
        currentLegalVersion(document).version,
        currentLegalVersion(document).sha256,
        'oauth_google',
      ]),
    );

    // Signed in, the parked row gone, the cookie cleared.
    const session = done.cookies.find((c) => c.name === 'session');
    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `session=${session!.value}` },
    });
    expect(me.json()).toMatchObject({
      user: { email: user.email },
      legal: { pending: [] },
    });
    expect(await app.db.select().from(oauthPendingSignups)).toHaveLength(0);
    expect(done.cookies.find((c) => c.name === 'oauth-signup')?.value).toBe('');
  });

  it('refuses missing or partial consents and keeps the sign-up pending', async () => {
    const { callback } = await googleCallback(googleUser());
    const cookie = cookieHeader(callback);

    for (const payload of [
      {},
      { consents: {} },
      { consents: { terms: CONSENTS.terms } },
      { consents: { personal_data_consent: CONSENTS.personal_data_consent } },
      { consents: { terms: true, personal_data_consent: true } },
    ]) {
      const refused = await complete(cookie, payload);
      expect(refused.statusCode).toBe(400);
    }
    expect(await count(users)).toBe(0);
    expect(await app.db.select().from(oauthPendingSignups)).toHaveLength(1);
    expect((await complete(cookie)).statusCode).toBe(200);
  });

  it('answers a stale document version with 409 and lets the reloaded page finish', async () => {
    const { callback } = await googleCallback(googleUser());
    const cookie = cookieHeader(callback);

    const stale = await complete(cookie, {
      consents: { ...CONSENTS, terms: '0.9' },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().code).toBe('legal_version_outdated');
    expect(await count(users)).toBe(0);
    expect((await complete(cookie)).statusCode).toBe(200);
  });

  it('is single-use: a replayed completion gets 410 and creates nothing more', async () => {
    const { callback } = await googleCallback(googleUser());
    const cookie = cookieHeader(callback);

    expect((await complete(cookie)).statusCode).toBe(200);
    const replay = await complete(cookie);
    expect(replay.statusCode).toBe(410);
    expect(replay.json().code).toBe('oauth_signup_expired');
    expect(await count(users)).toBe(1);
    expect(await count(sessions)).toBe(1);
    expect(await app.db.select().from(legalAcceptances)).toHaveLength(2);
  });

  it('lets exactly one of two concurrent completions through', async () => {
    const { callback } = await googleCallback(googleUser());
    const cookie = cookieHeader(callback);

    const answers = await Promise.all([0, 1, 2].map(() => complete(cookie)));
    expect(answers.map((a) => a.statusCode).sort()).toEqual([200, 410, 410]);
    expect(await count(users)).toBe(1);
    expect(await count(sessions)).toBe(1);
    expect(await app.db.select().from(legalAcceptances)).toHaveLength(2);
  });

  it('refuses a replayed callback: the code is spent, nothing is parked twice', async () => {
    const { replay } = await googleCallback(googleUser());
    const again = await app.inject({
      method: 'GET',
      url: replay.url,
      headers: { cookie: replay.cookie },
    });
    expect(again.statusCode).toBe(303);
    expect(String(again.headers.location)).toContain('/login?oauth=failed');
    expect(await app.db.select().from(oauthPendingSignups)).toHaveLength(1);
    expect(await count(users)).toBe(0);
  });

  it('keeps one pending row per provider account: a second tab replaces the first', async () => {
    const user = googleUser();
    const first = await googleCallback(user);
    const second = await googleCallback(user);

    expect(await app.db.select().from(oauthPendingSignups)).toHaveLength(1);
    expect((await complete(cookieHeader(first.callback))).statusCode).toBe(410);
    expect((await complete(cookieHeader(second.callback))).statusCode).toBe(
      200,
    );
    expect(await count(users)).toBe(1);
  });

  it('expires after 10 minutes and purges expired rows on the next sign-in', async () => {
    const { callback } = await googleCallback(googleUser());
    await app.db
      .update(oauthPendingSignups)
      .set({ expiresAt: new Date(Date.now() - 1000) });

    expect((await complete(cookieHeader(callback))).statusCode).toBe(410);
    await googleCallback(googleUser());
    // Only the new one is left.
    expect(await app.db.select().from(oauthPendingSignups)).toHaveLength(1);
  });

  it('cancels: the parked identity and the cookie are gone', async () => {
    const { callback } = await googleCallback(googleUser());
    const cookie = cookieHeader(callback);

    const cancelled = await app.inject({
      method: 'DELETE',
      url: SIGNUP,
      headers: { cookie, origin: WEB_ORIGIN },
    });
    expect(cancelled.statusCode).toBe(204);
    expect(
      cancelled.cookies.find((c) => c.name === 'oauth-signup')?.value,
    ).toBe('');
    expect(await app.db.select().from(oauthPendingSignups)).toHaveLength(0);
    expect((await complete(cookie)).statusCode).toBe(410);
  });

  it('refuses a cross-origin completion (CSRF check)', async () => {
    const { callback } = await googleCallback(googleUser());
    const refused = await app.inject({
      method: 'POST',
      url: SIGNUP,
      headers: {
        cookie: cookieHeader(callback),
        origin: 'https://evil.example',
      },
      payload: { consents: CONSENTS },
    });
    expect(refused.statusCode).toBe(403);
    expect(await count(users)).toBe(0);
  });

  it('signs a returning person straight in — no second consent step', async () => {
    const user = googleUser();
    const { callback } = await googleCallback(user);
    await complete(cookieHeader(callback));

    const again = await googleCallback(user);
    expect(again.callback.headers.location).toBe(`${WEB_ORIGIN}/me`);
    expect(
      again.callback.cookies.find((c) => c.name === 'session'),
    ).toBeDefined();
  });

  it('links an account created meanwhile instead of failing, with the acceptance recorded', async () => {
    const user = googleUser();
    const { callback } = await googleCallback(user);
    // A password registration for the same address lands during the consent step.
    const register = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin: WEB_ORIGIN },
      payload: {
        email: user.email,
        password: 'a-strong-password-123',
        consents: CONSENTS,
      },
    });
    expect(register.statusCode).toBe(201);

    const done = await complete(cookieHeader(callback));
    expect(done.statusCode).toBe(200);
    const rows = await app.db.select().from(users);
    expect(rows).toHaveLength(1);
    // ADR-035: the unverified password account is claimed.
    expect(rows[0]).toMatchObject({ emailVerified: true, passwordHash: null });
    const sources = (await app.db.select().from(legalAcceptances)).map(
      (a) => a.source,
    );
    // The claim voided the registrant's acceptance (it may have been a
    // pre-hijacker's); what is left is the acceptance of the person who signed in.
    expect(sources).toEqual(['oauth_google', 'oauth_google']);
  });

  it('asks the real owner to accept when Google claims an unverified password account', async () => {
    const user = googleUser();
    // Someone registered the address with a password and never confirmed it.
    await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin: WEB_ORIGIN },
      payload: {
        email: user.email,
        password: 'a-strong-password-123',
        consents: CONSENTS,
      },
    });
    // The address's owner signs in with Google: an existing account, so no
    // consent step — it is claimed (ADR-035) and signed in…
    const { callback } = await googleCallback(user);
    expect(callback.headers.location).toBe(`${WEB_ORIGIN}/me`);
    const session = callback.cookies.find((c) => c.name === 'session')!;
    // …with the registrant's acceptance gone: they must accept before acting.
    expect(await app.db.select().from(legalAcceptances)).toHaveLength(0);
    const me = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `session=${session.value}` },
    });
    expect(me.json().legal).toEqual({
      pending: ['terms', 'personal_data_consent'],
    });
  });

  it('answers 409 oauth_signup_failed when the account was blocked meanwhile', async () => {
    const user = googleUser();
    const { callback } = await googleCallback(user);
    await app.db.insert(users).values({
      email: user.email!,
      passwordHash: null,
      emailVerified: true,
      blockedAt: new Date(),
      blockReason: 'spam',
    });

    const refused = await complete(cookieHeader(callback));
    expect(refused.statusCode).toBe(409);
    expect(refused.json().code).toBe('oauth_signup_failed');
    expect(refused.cookies.find((c) => c.name === 'session')).toBeUndefined();
    expect(await count(sessions)).toBe(0);
  });
});

describe('first Yandex sign-in — the consent step', () => {
  it('parks, then creates the account with oauth_yandex acceptances', async () => {
    const user: FakeYandexUser = {
      id: `11300000${Math.floor(Math.random() * 1e8)}`,
      default_email: `${randomUUID()}@yandex.test`,
      first_name: 'Анна',
      last_name: 'Велосипедова',
    };
    const callback = await yandexCallback(user);
    expect(callback.headers.location).toBe(CONSENT_PAGE);
    expect(await count(users)).toBe(0);

    const read = await app.inject({
      method: 'GET',
      url: SIGNUP,
      headers: { cookie: cookieHeader(callback) },
    });
    expect(read.json()).toEqual({
      provider: 'yandex',
      email: user.default_email,
    });

    const done = await complete(cookieHeader(callback));
    expect(done.statusCode).toBe(200);
    expect(done.json()).toEqual({ next: '/me' });
    const sources = (await app.db.select().from(legalAcceptances)).map(
      (a) => a.source,
    );
    expect(sources).toEqual(['oauth_yandex', 'oauth_yandex']);
  });
});
