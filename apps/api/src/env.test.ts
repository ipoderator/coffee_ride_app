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
});
