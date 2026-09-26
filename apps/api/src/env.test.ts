import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const BASE_ENV_SOURCE = {
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: 'postgresql://localhost:5432/does-not-matter-for-this-test',
  WEB_ORIGIN: 'http://localhost:3000',
};

describe('loadEnv', () => {
  it('boots with no optional vars set at all', () => {
    const env = loadEnv(BASE_ENV_SOURCE);
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
    expect(env.ERROR_REPORTING_WEBHOOK_URL).toBeUndefined();
  });

  // KI-046: docker-compose.prod.yml wires REDIS_URL/S3_ENDPOINT through
  // `${VAR}` unconditionally, and Compose substitutes an empty string (not
  // an absent variable) for one left unset in `.env`. This must not crash
  // boot — "not configured" is a supported degraded mode.
  it('treats an empty-string REDIS_URL/S3_ENDPOINT as not configured, not a validation error', () => {
    const env = loadEnv({
      ...BASE_ENV_SOURCE,
      REDIS_URL: '',
      S3_ENDPOINT: '',
    });
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
  });

  it('still rejects a genuinely malformed REDIS_URL/S3_ENDPOINT', () => {
    expect(() =>
      loadEnv({ ...BASE_ENV_SOURCE, REDIS_URL: 'not-a-url' }),
    ).toThrow(/Invalid environment configuration/);
    expect(() =>
      loadEnv({ ...BASE_ENV_SOURCE, S3_ENDPOINT: 'not-a-url' }),
    ).toThrow(/Invalid environment configuration/);
  });

  it('accepts a real REDIS_URL/S3_ENDPOINT', () => {
    const env = loadEnv({
      ...BASE_ENV_SOURCE,
      REDIS_URL: 'redis://:secret@redis.internal:6379',
      S3_ENDPOINT: 'https://s3.internal',
    });
    expect(env.REDIS_URL).toBe('redis://:secret@redis.internal:6379');
    expect(env.S3_ENDPOINT).toBe('https://s3.internal');
  });

  it('refuses to boot in production with a placeholder AUTH_SECRET', () => {
    expect(() =>
      loadEnv({
        ...BASE_ENV_SOURCE,
        NODE_ENV: 'production',
        AUTH_SECRET: 'change-me',
        WEB_ORIGIN: 'https://coffeeride.example',
        DATABASE_URL: 'postgresql://prod-host:5432/coffee_ride',
      }),
    ).toThrow(/Refusing to start in production/);
  });

  it('boots in production with real, non-placeholder values and empty optional vars', () => {
    const env = loadEnv({
      ...BASE_ENV_SOURCE,
      NODE_ENV: 'production',
      AUTH_SECRET: 'a-real-generated-secret',
      WEB_ORIGIN: 'https://coffeeride.example',
      DATABASE_URL: 'postgresql://prod-host:5432/coffee_ride',
      REDIS_URL: '',
      S3_ENDPOINT: '',
    });
    expect(env.NODE_ENV).toBe('production');
    expect(env.REDIS_URL).toBeUndefined();
    expect(env.S3_ENDPOINT).toBeUndefined();
  });

  // KI-014: test/dev-only override of both auth rate-limit tiers.
  it('leaves AUTH_RATE_LIMIT_MAX unset by default and coerces a valid value', () => {
    expect(loadEnv(BASE_ENV_SOURCE).AUTH_RATE_LIMIT_MAX).toBeUndefined();
    expect(
      loadEnv({ ...BASE_ENV_SOURCE, AUTH_RATE_LIMIT_MAX: '' })
        .AUTH_RATE_LIMIT_MAX,
    ).toBeUndefined();
    expect(
      loadEnv({ ...BASE_ENV_SOURCE, AUTH_RATE_LIMIT_MAX: '1000' })
        .AUTH_RATE_LIMIT_MAX,
    ).toBe(1000);
  });

  it('rejects a non-positive or non-integer AUTH_RATE_LIMIT_MAX', () => {
    for (const value of ['0', '-5', '2.5', 'lots']) {
      expect(() =>
        loadEnv({ ...BASE_ENV_SOURCE, AUTH_RATE_LIMIT_MAX: value }),
      ).toThrow(/Invalid environment configuration: AUTH_RATE_LIMIT_MAX/);
    }
  });

  it('refuses to boot in production with AUTH_RATE_LIMIT_MAX set at all', () => {
    expect(() =>
      loadEnv({
        ...BASE_ENV_SOURCE,
        NODE_ENV: 'production',
        AUTH_SECRET: 'a-real-generated-secret',
        WEB_ORIGIN: 'https://coffeeride.example',
        DATABASE_URL: 'postgresql://prod-host:5432/coffee_ride',
        AUTH_RATE_LIMIT_MAX: '5',
      }),
    ).toThrow(/Refusing to start in production[\s\S]*AUTH_RATE_LIMIT_MAX/);
  });

  // CR-135: the same override for the global tier.
  it('leaves RATE_LIMIT_MAX unset by default and coerces a valid value', () => {
    expect(loadEnv(BASE_ENV_SOURCE).RATE_LIMIT_MAX).toBeUndefined();
    expect(
      loadEnv({ ...BASE_ENV_SOURCE, RATE_LIMIT_MAX: '' }).RATE_LIMIT_MAX,
    ).toBeUndefined();
    expect(
      loadEnv({ ...BASE_ENV_SOURCE, RATE_LIMIT_MAX: '10000' }).RATE_LIMIT_MAX,
    ).toBe(10000);
    expect(() => loadEnv({ ...BASE_ENV_SOURCE, RATE_LIMIT_MAX: '0' })).toThrow(
      /Invalid environment configuration: RATE_LIMIT_MAX/,
    );
  });

  it('refuses to boot in production with RATE_LIMIT_MAX set at all', () => {
    expect(() =>
      loadEnv({
        ...BASE_ENV_SOURCE,
        NODE_ENV: 'production',
        AUTH_SECRET: 'a-real-generated-secret',
        WEB_ORIGIN: 'https://coffeeride.example',
        DATABASE_URL: 'postgresql://prod-host:5432/coffee_ride',
        RATE_LIMIT_MAX: '100',
      }),
    ).toThrow(/Refusing to start in production[\s\S]*RATE_LIMIT_MAX/);
  });
});
