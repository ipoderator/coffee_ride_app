import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  emailVerificationTokens,
  passwordResetTokens,
  sessions,
} from 'db/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv, type Env } from '../../env.js';
import { requestPasswordReset } from './auth.service.js';
import { hashSessionToken } from './session.js';

// These tests exercise the real service/repository layers against a live
// Postgres database (`.claude/rules/testing.md` — behavior, not mocks, for
// something this invariant-sensitive). Requires DATABASE_URL to point at a
// real, migrated database — the same contract CI's `postgres` service
// fulfills (`.github/workflows/ci.yml`); locally, point it at the scratch
// database used for this ticket's live verification
// (`.claude/context/current-task.md`).
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is required to run apps/api tests (auth.routes.test.ts needs a real, migrated Postgres database).',
  );
}

const WEB_ORIGIN = 'http://localhost:3000';

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: process.env.DATABASE_URL,
  WEB_ORIGIN,
});

function uniqueEmail() {
  return `${randomUUID()}@example.test`;
}

// `DELETE FROM users`, not `TRUNCATE ... CASCADE`: `email_verification_tokens`
// and `sessions` both cascade-delete via their FK (`onDelete: 'cascade'`), so
// a plain DELETE clears everything this suite needs without TRUNCATE's
// table-level ACCESS EXCLUSIVE lock — which deadlocked once this became a
// second test file touching the same tables concurrently (Vitest runs test
// files in parallel by default; CR-012 added `session.test.ts`).
describe('POST /v1/auth/register', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  it('creates a user and returns 201 with no passwordHash, plus a dev-only verification URL', async () => {
    const app = await buildApp(testEnv);
    const email = uniqueEmail();

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'a-strong-password-123' },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user.email).toBe(email);
    expect(body.user.emailVerified).toBe(false);
    expect(body.user.id).toBeTypeOf('string');
    expect(body).not.toHaveProperty('user.passwordHash');
    expect(JSON.stringify(body)).not.toContain('passwordHash');
    expect(body.verificationUrl).toContain('/v1/auth/verify-email?token=');

    await app.close();
  });

  it('never returns a verification URL in production', async () => {
    // Built directly rather than via `loadEnv()`: `loadEnv` itself refuses to
    // boot in production against a localhost DATABASE_URL (by design — see
    // env.ts's placeholder checks) — orthogonal to what this test verifies,
    // which is `auth.routes.ts`'s own `NODE_ENV` branch.
    const prodEnv: Env = { ...testEnv, NODE_ENV: 'production' };
    const app = await buildApp(prodEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: uniqueEmail(), password: 'a-strong-password-123' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().verificationUrl).toBeUndefined();

    await app.close();
  });

  it('rejects a duplicate email with 409', async () => {
    const app = await buildApp(testEnv);
    const email = uniqueEmail();
    const payload = { email, password: 'a-strong-password-123' };

    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload,
    });
    expect(second.statusCode).toBe(409);
    const body = second.json();
    expect(body.code).toBe('email_already_registered');
    expect(second.headers['content-type']).toContain(
      'application/problem+json',
    );

    await app.close();
  });

  it('is case-insensitive on email for duplicate detection', async () => {
    const app = await buildApp(testEnv);
    const email = uniqueEmail();

    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email, password: 'a-strong-password-123' },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: email.toUpperCase(),
        password: 'a-strong-password-123',
      },
    });
    expect(second.statusCode).toBe(409);

    await app.close();
  });

  it('rejects an invalid payload with 400', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'not-an-email', password: 'too-short' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.code).toBe('validation_error');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);

    await app.close();
  });

  it('rate-limits after the auth tier threshold', async () => {
    const app = await buildApp(testEnv);
    const attempts = 6; // tier is 5/min — see auth.routes.ts's AUTH_RATE_LIMIT

    const responses = [];
    for (let i = 0; i < attempts; i += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/v1/auth/register',
          payload: { email: uniqueEmail(), password: 'a-strong-password-123' },
        }),
      );
    }

    const statuses = responses.map((r) => r.statusCode);
    expect(statuses.filter((s) => s === 201).length).toBe(5);
    expect(statuses.at(-1)).toBe(429);

    await app.close();
  });
});

describe('POST /v1/auth/verify-email', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  async function registerAndGetToken(
    app: Awaited<ReturnType<typeof buildApp>>,
  ) {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: uniqueEmail(), password: 'a-strong-password-123' },
    });
    const url: string = response.json().verificationUrl;
    const token = new URL(url, 'http://localhost').searchParams.get('token');
    if (!token) throw new Error('No token in verificationUrl');
    return token;
  }

  it('verifies a valid token and flips emailVerified to true', async () => {
    const app = await buildApp(testEnv);
    const token = await registerAndGetToken(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.emailVerified).toBe(true);

    await app.close();
  });

  it('rejects an unknown token with a 400 domain error', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token: 'not-a-real-token' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('invalid_verification_token');

    await app.close();
  });

  it('rejects a token that was already used', async () => {
    const app = await buildApp(testEnv);
    const token = await registerAndGetToken(app);

    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token },
    });
    expect(second.statusCode).toBe(400);
    expect(second.json().code).toBe('verification_token_already_used');

    await app.close();
  });

  it('rejects an expired token', async () => {
    const app = await buildApp(testEnv);
    const token = await registerAndGetToken(app);

    // Force the token's row into the past — same hashing the service uses.
    const { hashToken } = await import('./tokens.js');
    await app.db
      .update(emailVerificationTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(sql`${emailVerificationTokens.tokenHash} = ${hashToken(token)}`);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('verification_token_expired');

    await app.close();
  });
});

const PASSWORD = 'a-strong-password-123';

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = uniqueEmail();
  const response = await app.inject({
    method: 'POST',
    url: '/v1/auth/register',
    payload: { email, password: PASSWORD },
  });
  return {
    email,
    password: PASSWORD,
    userId: response.json().user.id as string,
  };
}

function sessionCookie(
  response: Awaited<ReturnType<Awaited<ReturnType<typeof buildApp>>['inject']>>,
) {
  return response.cookies.find((c) => c.name === 'session');
}

describe('POST /v1/auth/login', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  it('logs in with correct credentials: 200 + session cookie + user', async () => {
    const app = await buildApp(testEnv);
    const { email, password } = await registerTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user.email).toBe(email);
    expect(JSON.stringify(body)).not.toContain('passwordHash');

    const cookie = sessionCookie(response);
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.path).toBe('/');
    // Local dev (NODE_ENV=test here, same as development): plain HTTP, so
    // `Secure` must NOT be set or the cookie would never reach the browser.
    expect(cookie?.secure).toBeFalsy();

    await app.close();
  });

  it('rejects a wrong password with 401 invalid_credentials', async () => {
    const app = await buildApp(testEnv);
    const { email } = await registerTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: 'the-wrong-password-123' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('invalid_credentials');

    await app.close();
  });

  it('rejects an unknown email with the identical 401 invalid_credentials shape', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: uniqueEmail(), password: 'irrelevant-password-123' },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.code).toBe('invalid_credentials');
    expect(body.title).toBe('Invalid credentials');
    expect(body.detail).toBe('Incorrect email or password.');

    await app.close();
  });

  it('rejects a missing/malformed body with 400', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'not-an-email' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');

    await app.close();
  });
});

describe('POST /v1/auth/logout', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  async function loginAndGetCookie(app: Awaited<ReturnType<typeof buildApp>>) {
    const { email, password } = await registerTestUser(app);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    const cookie = sessionCookie(response);
    if (!cookie) throw new Error('No session cookie set by login');
    return cookie.value;
  }

  it('deletes the session row, clears the cookie, and 204s — reusing the cookie afterward 401s', async () => {
    const app = await buildApp(testEnv);
    const rawToken = await loginAndGetCookie(app);

    const logoutResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      cookies: { session: rawToken },
    });

    expect(logoutResponse.statusCode).toBe(204);

    // Verified via a direct DB query, not just the HTTP response.
    const [row] = await app.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashSessionToken(rawToken)));
    expect(row).toBeUndefined();

    const clearedCookie = sessionCookie(logoutResponse);
    expect(clearedCookie).toBeDefined();
    expect(clearedCookie?.expires?.getTime()).toBeLessThan(Date.now());

    const meAfterLogout = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      cookies: { session: rawToken },
    });
    expect(meAfterLogout.statusCode).toBe(401);

    await app.close();
  });

  it('rejects a request with no cookie with 401', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});

describe('POST /v1/auth/forgot-password', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  it('returns 204 with no body for a real, registered email', async () => {
    const app = await buildApp(testEnv);
    const { email } = await registerTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');

    await app.close();
  });

  it('returns the identical 204 with no body for an unknown email — no account enumeration', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email: uniqueEmail() },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');

    await app.close();
  });

  it('never returns a reset token anywhere in the response, even outside production', async () => {
    const app = await buildApp(testEnv);
    const { email } = await registerTestUser(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email },
    });

    expect(response.statusCode).toBe(204);
    expect(response.body).not.toContain('token');

    await app.close();
  });

  it('actually creates a token row for a known email (verified via the service layer, not HTTP)', async () => {
    const app = await buildApp(testEnv);
    const { email } = await registerTestUser(app);

    const result = await requestPasswordReset(app.db, email);

    expect(result.userFound).toBe(true);
    expect(result.resetToken).toBeTypeOf('string');

    await app.close();
  });

  it('rate-limits after the auth tier threshold', async () => {
    const app = await buildApp(testEnv);
    const attempts = 6; // tier is 5/min — see auth.routes.ts's AUTH_RATE_LIMIT

    const responses = [];
    for (let i = 0; i < attempts; i += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/v1/auth/forgot-password',
          payload: { email: uniqueEmail() },
        }),
      );
    }

    const statuses = responses.map((r) => r.statusCode);
    expect(statuses.filter((s) => s === 204).length).toBe(5);
    expect(statuses.at(-1)).toBe(429);

    await app.close();
  });
});

describe('POST /v1/auth/reset-password', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  const NEW_PASSWORD = 'a-brand-new-password-456';

  it('resets the password with a valid token, and the new password logs in', async () => {
    const app = await buildApp(testEnv);
    const { email } = await registerTestUser(app);
    const { resetToken } = await requestPasswordReset(app.db, email);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: resetToken, password: NEW_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(email);
    expect(JSON.stringify(response.json())).not.toContain('passwordHash');

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: NEW_PASSWORD },
    });
    expect(loginResponse.statusCode).toBe(200);

    await app.close();
  });

  it('revokes every existing session for that user on a successful reset', async () => {
    const app = await buildApp(testEnv);
    const { email, password } = await registerTestUser(app);
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    const rawSessionToken = sessionCookie(loginResponse)!.value;

    const { resetToken } = await requestPasswordReset(app.db, email);
    await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: resetToken, password: NEW_PASSWORD },
    });

    const meResponse = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      cookies: { session: rawSessionToken },
    });
    expect(meResponse.statusCode).toBe(401);

    await app.close();
  });

  it('invalidates every other outstanding reset token for the same user', async () => {
    const app = await buildApp(testEnv);
    const { email } = await registerTestUser(app);
    const { resetToken: firstToken } = await requestPasswordReset(
      app.db,
      email,
    );
    const { resetToken: secondToken } = await requestPasswordReset(
      app.db,
      email,
    );

    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: firstToken, password: NEW_PASSWORD },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: secondToken, password: 'yet-another-password-789' },
    });
    expect(second.statusCode).toBe(400);
    expect(second.json().code).toBe('reset_token_already_used');

    await app.close();
  });

  it('rejects an unknown token with a 400 domain error', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: 'not-a-real-token', password: NEW_PASSWORD },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('invalid_reset_token');

    await app.close();
  });

  it('rejects a token that was already used', async () => {
    const app = await buildApp(testEnv);
    const { email } = await registerTestUser(app);
    const { resetToken } = await requestPasswordReset(app.db, email);

    const first = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: resetToken, password: NEW_PASSWORD },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: resetToken, password: 'yet-another-password-789' },
    });
    expect(second.statusCode).toBe(400);
    expect(second.json().code).toBe('reset_token_already_used');

    await app.close();
  });

  it('rejects an expired token', async () => {
    const app = await buildApp(testEnv);
    const { email } = await registerTestUser(app);
    const { resetToken } = await requestPasswordReset(app.db, email);

    const { hashToken } = await import('./tokens.js');
    await app.db
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(sql`${passwordResetTokens.tokenHash} = ${hashToken(resetToken!)}`);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: resetToken, password: NEW_PASSWORD },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('reset_token_expired');

    await app.close();
  });

  it('rejects a password shorter than 12 characters with 400', async () => {
    const app = await buildApp(testEnv);
    const { email } = await registerTestUser(app);
    const { resetToken } = await requestPasswordReset(app.db, email);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: resetToken, password: 'too-short' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');

    await app.close();
  });

  it('rate-limits after the auth tier threshold', async () => {
    const app = await buildApp(testEnv);
    const attempts = 6; // tier is 5/min — see auth.routes.ts's AUTH_RATE_LIMIT

    const responses = [];
    for (let i = 0; i < attempts; i += 1) {
      responses.push(
        await app.inject({
          method: 'POST',
          url: '/v1/auth/reset-password',
          payload: { token: 'not-a-real-token', password: NEW_PASSWORD },
        }),
      );
    }

    const statuses = responses.map((r) => r.statusCode);
    expect(statuses.filter((s) => s === 400).length).toBe(5);
    expect(statuses.at(-1)).toBe(429);

    await app.close();
  });
});

describe('GET /v1/auth/me', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  async function login(app: Awaited<ReturnType<typeof buildApp>>) {
    const { email, password } = await registerTestUser(app);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password },
    });
    return { email, rawToken: sessionCookie(response)!.value };
  }

  it('returns the current user for a valid cookie', async () => {
    const app = await buildApp(testEnv);
    const { email, rawToken } = await login(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      cookies: { session: rawToken },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(email);
    expect(JSON.stringify(response.json())).not.toContain('passwordHash');

    await app.close();
  });

  it('rejects a request with no cookie with 401', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({ method: 'GET', url: '/v1/auth/me' });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('rejects an expired session cookie with 401', async () => {
    const app = await buildApp(testEnv);
    const { rawToken } = await login(app);

    await app.db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, hashSessionToken(rawToken)));

    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      cookies: { session: rawToken },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });

  it('rejects a tampered cookie value with 401', async () => {
    const app = await buildApp(testEnv);
    await login(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      cookies: { session: 'not-a-real-session-token' },
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});

describe('CSRF: Origin/Referer check on /v1 unsafe methods', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(sql`DELETE FROM users`);
    await app.close();
  });

  it('rejects a state-changing request with a mismatched Origin with 403', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin: 'http://evil.example' },
      payload: { email: uniqueEmail(), password: PASSWORD },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('csrf_origin_mismatch');

    await app.close();
  });

  it('allows a state-changing request with a matching Origin through to the route', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      headers: { origin: WEB_ORIGIN },
      payload: { email: uniqueEmail(), password: PASSWORD },
    });

    expect(response.statusCode).toBe(201);

    await app.close();
  });

  it('never blocks a GET regardless of Origin', async () => {
    const app = await buildApp(testEnv);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { origin: 'http://evil.example' },
    });

    // No session cookie either way, but the point is it's a 401 (reached the
    // route/preHandler), never a 403 from the CSRF check.
    expect(response.statusCode).toBe(401);

    await app.close();
  });
});
