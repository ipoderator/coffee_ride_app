import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { emailVerificationTokens } from 'db/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv, type Env } from '../../env.js';

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

const testEnv = loadEnv({
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: process.env.DATABASE_URL,
});

function uniqueEmail() {
  return `${randomUUID()}@example.test`;
}

describe('POST /v1/auth/register', () => {
  beforeEach(async () => {
    const app = await buildApp(testEnv);
    await app.db.execute(
      sql`TRUNCATE TABLE email_verification_tokens, users RESTART IDENTITY CASCADE`,
    );
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
    await app.db.execute(
      sql`TRUNCATE TABLE email_verification_tokens, users RESTART IDENTITY CASCADE`,
    );
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
