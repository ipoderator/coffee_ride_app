import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../app.js';
import { loadEnv, type Env } from '../../env.js';
import { getTestDatabaseUrl } from '../../test-support/test-database-url.js';
import { hashPassword } from './password.js';
import {
  createRecaptchaVerifier,
  RECAPTCHA_VERIFY_URL,
} from './recaptcha-client.js';

// CR-261 (ADR-038): the reCAPTCHA gate on register, password login and
// forgot-password, end to end through the real routes and database. Google's
// siteverify is the only fake: a `fetch` that answers per token the way Google does.

const SECRET = 'a-test-only-recaptcha-secret';
const PASSWORD = 'a-strong-password-123';

const baseEnv = {
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: getTestDatabaseUrl(),
  WEB_ORIGIN: 'http://localhost:3000',
};

type GoogleAnswer =
  { kind: 'json'; body: unknown; status?: number } | { kind: 'network-error' };

/** Google's siteverify, keyed by token; anything unknown is `invalid-input-response`. */
function fakeSiteverify(answers: Record<string, GoogleAnswer>) {
  const calls: URLSearchParams[] = [];
  const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe(RECAPTCHA_VERIFY_URL);
    const form = new URLSearchParams(String(init?.body));
    calls.push(form);
    const answer = answers[form.get('response') ?? ''] ?? {
      kind: 'json',
      body: { success: false, 'error-codes': ['invalid-input-response'] },
    };
    if (answer.kind === 'network-error') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(answer.body), {
      status: answer.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  return { fetchImpl, calls };
}

const GOOGLE = fakeSiteverify({
  'good-token': { kind: 'json', body: { success: true } },
  'expired-token': {
    kind: 'json',
    body: { success: false, 'error-codes': ['timeout-or-duplicate'] },
  },
  'google-down-token': { kind: 'json', body: {}, status: 503 },
  'network-down-token': { kind: 'network-error' },
});

async function appWithCaptcha(envOverrides: Record<string, string> = {}) {
  const env: Env = loadEnv({
    ...baseEnv,
    RECAPTCHA_SECRET_KEY: SECRET,
    ...envOverrides,
  });
  const app = await buildApp(env);
  // The plugin builds a real verifier from the secret; swap in one whose `fetch`
  // is the fake Google above (same pattern as `google.routes.test.ts`).
  expect(app.recaptcha).not.toBeNull();
  app.recaptcha = createRecaptchaVerifier({
    secretKey: SECRET,
    fetchImpl: GOOGLE.fetchImpl,
  });
  return app;
}

type TestApp = Awaited<ReturnType<typeof appWithCaptcha>>;

function uniqueEmail() {
  return `${randomUUID()}@example.test`;
}

async function userCount(app: TestApp, email: string) {
  const rows = await app.db.execute(
    sql`SELECT 1 FROM users WHERE email = ${email}`,
  );
  return rows.length;
}

let app: TestApp;

beforeEach(async () => {
  GOOGLE.fetchImpl.mockClear();
  GOOGLE.calls.length = 0;
  // Every test uses its own random email, so no table-wide cleanup is needed.
  app = await appWithCaptcha();
});

afterEach(async () => {
  await app.close();
});

describe('POST /v1/auth/register with reCAPTCHA on', () => {
  it('creates the account when Google accepts the token, sending only password', async () => {
    const email = uniqueEmail();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      remoteAddress: '203.0.113.7',
      payload: { email, password: PASSWORD, captchaToken: 'good-token' },
    });

    expect(response.statusCode).toBe(201);
    expect(await userCount(app, email)).toBe(1);
    expect(GOOGLE.calls).toHaveLength(1);
    expect(GOOGLE.calls[0]!.get('secret')).toBe(SECRET);
    expect(GOOGLE.calls[0]!.get('response')).toBe('good-token');
    expect(GOOGLE.calls[0]!.get('remoteip')).toBe('203.0.113.7');
    // Neither the secret nor the token ever goes back to the client.
    expect(response.body).not.toContain(SECRET);
    expect(response.body).not.toContain('good-token');
  });

  it.each([
    ['missing', undefined, 400, 'captcha_required'],
    ['invalid', 'forged-token', 400, 'captcha_invalid'],
    ['expired', 'expired-token', 400, 'captcha_invalid'],
    [
      'unconfirmable (Google 503)',
      'google-down-token',
      503,
      'captcha_unavailable',
    ],
    [
      'unconfirmable (network)',
      'network-down-token',
      503,
      'captcha_unavailable',
    ],
  ])(
    'refuses a %s token and creates nothing',
    async (_case, captchaToken, status, code) => {
      const email = uniqueEmail();
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        payload: { email, password: PASSWORD, captchaToken },
      });

      expect(response.statusCode).toBe(status);
      expect(response.headers['content-type']).toContain(
        'application/problem+json',
      );
      expect(response.json()).toMatchObject({ code, status });
      expect(response.body).not.toContain(SECRET);
      expect(await userCount(app, email)).toBe(0);
      expect(GOOGLE.calls).toHaveLength(captchaToken ? 1 : 0);
    },
  );

  it('rejects an empty token as a validation error before asking Google', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: uniqueEmail(), password: PASSWORD, captchaToken: '' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');
    expect(GOOGLE.calls).toHaveLength(0);
  });

  it('checks the password before the CAPTCHA, so a short one never costs a Google call', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: uniqueEmail(),
        password: 'short',
        captchaToken: 'good-token',
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('validation_error');
    expect(GOOGLE.calls).toHaveLength(0);
  });

  it('opens the breaker after repeated Google failures and stops calling it', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/register',
        remoteAddress: `198.51.100.${i + 1}`,
        payload: {
          email: uniqueEmail(),
          password: PASSWORD,
          captchaToken: 'google-down-token',
        },
      });
      expect(response.statusCode).toBe(503);
    }
    const shortCircuited = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      remoteAddress: '198.51.100.9',
      payload: {
        email: uniqueEmail(),
        password: PASSWORD,
        captchaToken: 'good-token',
      },
    });
    expect(shortCircuited.statusCode).toBe(503);
    expect(shortCircuited.json().code).toBe('captcha_unavailable');
    expect(GOOGLE.calls).toHaveLength(5);
  });
});

describe('POST /v1/auth/login with reCAPTCHA on', () => {
  async function seedUser(email: string) {
    await app.db.execute(
      sql`INSERT INTO users (email, password_hash, email_verified)
          VALUES (${email}, ${await hashPassword(PASSWORD)}, true)`,
    );
  }

  it('signs in with a valid token and sets the session cookie', async () => {
    const email = uniqueEmail();
    await seedUser(email);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email, password: PASSWORD, captchaToken: 'good-token' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.cookies.some((c) => c.value !== '')).toBe(true);
  });

  it.each([
    [undefined, 'captcha_required'],
    ['expired-token', 'captcha_invalid'],
  ])(
    'answers the CAPTCHA error the same for a real and an unknown account (token %s)',
    async (captchaToken, code) => {
      const email = uniqueEmail();
      await seedUser(email);
      const real = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: PASSWORD, captchaToken },
      });
      const unknown = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email: uniqueEmail(), password: PASSWORD, captchaToken },
      });
      expect(real.statusCode).toBe(400);
      expect(real.json().code).toBe(code);
      expect(real.json()).toEqual({
        ...unknown.json(),
        instance: real.json().instance,
      });
      expect(real.cookies).toHaveLength(0);
    },
  );

  it('keeps the generic invalid_credentials once the CAPTCHA passes', async () => {
    const email = uniqueEmail();
    await seedUser(email);
    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email,
        password: 'not-the-password',
        captchaToken: 'good-token',
      },
    });
    const noAccount = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: uniqueEmail(),
        password: 'not-the-password',
        captchaToken: 'good-token',
      },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(wrongPassword.json().code).toBe('invalid_credentials');
    expect(noAccount.json().code).toBe('invalid_credentials');
  });

  it('answers 503 captcha_unavailable while Google is down', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: uniqueEmail(),
        password: PASSWORD,
        captchaToken: 'network-down-token',
      },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json().code).toBe('captcha_unavailable');
  });
});

describe('POST /v1/auth/forgot-password with reCAPTCHA on', () => {
  it('answers 204 with a valid token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email: uniqueEmail(), captchaToken: 'good-token' },
    });
    expect(response.statusCode).toBe(204);
  });

  it.each([
    [undefined, 400, 'captcha_required'],
    ['forged-token', 400, 'captcha_invalid'],
    ['google-down-token', 503, 'captcha_unavailable'],
  ])('refuses token %s with %i %s', async (captchaToken, status, code) => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/forgot-password',
      payload: { email: uniqueEmail(), captchaToken },
    });
    expect(response.statusCode).toBe(status);
    expect(response.json().code).toBe(code);
  });
});

describe('the reCAPTCHA gate and the rest of auth', () => {
  it('lets both rate-limit tiers refuse a flood before any Google call', async () => {
    await app.close();
    app = await appWithCaptcha({ AUTH_RATE_LIMIT_MAX: '2' });
    const email = uniqueEmail();
    const statuses: number[] = [];
    for (let i = 0; i < 3; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/login',
        payload: { email, password: PASSWORD, captchaToken: 'forged-token' },
      });
      statuses.push(response.statusCode);
    }
    expect(statuses).toEqual([400, 400, 429]);
    expect(GOOGLE.calls).toHaveLength(2);
  });

  it('asks no token of the token-based routes (verify-email, reset-password)', async () => {
    const verify = await app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email',
      payload: { token: 'not-a-real-token' },
    });
    const reset = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      payload: { token: 'not-a-real-token', password: PASSWORD },
    });
    expect(verify.json().code).not.toMatch(/^captcha_/);
    expect(reset.json().code).not.toMatch(/^captcha_/);
    expect(GOOGLE.calls).toHaveLength(0);
  });

  it('never puts Google sign-in behind the CAPTCHA', async () => {
    await app.close();
    app = await appWithCaptcha({
      GOOGLE_CLIENT_ID: 'a-client-id',
      GOOGLE_CLIENT_SECRET: 'a-client-secret',
    });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/google',
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toMatch(
      /^https:\/\/accounts\.google\.com\//,
    );
    expect(GOOGLE.calls).toHaveLength(0);
  });

  it('never puts Yandex ID sign-in behind the CAPTCHA', async () => {
    await app.close();
    app = await appWithCaptcha({
      YANDEX_CLIENT_ID: 'a-yandex-client-id',
      YANDEX_CLIENT_SECRET: 'a-yandex-client-secret',
    });
    const response = await app.inject({
      method: 'GET',
      url: '/v1/auth/yandex',
    });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toMatch(
      /^https:\/\/oauth\.yandex\.ru\/authorize\?/,
    );
    expect(GOOGLE.calls).toHaveLength(0);
  });

  it('asks for no token while RECAPTCHA_SECRET_KEY is unset', async () => {
    await app.close();
    app = await buildApp(loadEnv(baseEnv));
    expect(app.recaptcha).toBeNull();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: uniqueEmail(), password: PASSWORD },
    });
    expect(response.statusCode).toBe(201);
    expect(GOOGLE.calls).toHaveLength(0);
  });
});
