import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';
import { runPreflight } from './preflight.js';

// A configuration with every optional feature genuinely configured, so each
// test can switch exactly one thing off and assert only that finding appears.
const FULLY_CONFIGURED = {
  NODE_ENV: 'test',
  AUTH_SECRET: 'a-test-only-secret',
  DATABASE_URL: 'postgresql://db.internal:5432/coffee_ride',
  WEB_ORIGIN: 'https://rides.example.com',
  REDIS_URL: 'redis://redis.internal:6379',
  S3_ENDPOINT: 'https://s3.example.com',
  MAPS_2GIS_API_KEY: 'a-key',
  UNISENDER_API_KEY: 'a-key',
  EMAIL_FROM_ADDRESS: 'rides@example.com',
  ERROR_REPORTING_WEBHOOK_URL: 'https://sink.example.com/hook',
};

const keysOf = (env: Record<string, string>) =>
  runPreflight(loadEnv(env)).flatMap((finding) => finding.keys);

describe('runPreflight', () => {
  it('reports nothing when every optional feature is configured', () => {
    expect(runPreflight(loadEnv(FULLY_CONFIGURED))).toEqual([]);
  });

  // The case this module exists for (KI-026/KI-042): `plugins/email.ts`'s
  // all-or-nothing gate absorbs a half-configured pair into
  // `emailProvider = null`, so nothing else in the system would ever say that
  // verification and password-reset links are silently undeliverable.
  it('reports an email key with no verified sender address', () => {
    const findings = runPreflight(
      loadEnv({ ...FULLY_CONFIGURED, EMAIL_FROM_ADDRESS: '' }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.keys).toEqual([
      'UNISENDER_API_KEY',
      'EMAIL_FROM_ADDRESS',
    ]);
    expect(findings[0]?.consequence).toMatch(/password reset/i);
  });

  it('reports skipped email verification while it is on (CR-220)', () => {
    expect(
      keysOf({ ...FULLY_CONFIGURED, AUTH_SKIP_EMAIL_VERIFICATION: 'true' }),
    ).toEqual(['AUTH_SKIP_EMAIL_VERIFICATION']);
  });

  it('reports a sender address with no email key', () => {
    const findings = runPreflight(
      loadEnv({ ...FULLY_CONFIGURED, UNISENDER_API_KEY: '' }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.keys).toEqual([
      'EMAIL_FROM_ADDRESS',
      'UNISENDER_API_KEY',
    ]);
  });

  // The half-configured checks and the not-configured-at-all check must be
  // mutually exclusive — overlapping conditions would report the same gap
  // twice and train the operator to skim the report.
  it('reports no email configuration at all exactly once', () => {
    const findings = runPreflight(
      loadEnv({
        ...FULLY_CONFIGURED,
        UNISENDER_API_KEY: '',
        EMAIL_FROM_ADDRESS: '',
      }),
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]?.keys).toEqual(['UNISENDER_API_KEY']);
  });

  it.each([
    ['MAPS_2GIS_API_KEY', /route building/i],
    ['REDIS_URL', /notification/i],
    ['S3_ENDPOINT', /upload/i],
    ['ERROR_REPORTING_WEBHOOK_URL', /stdout/i],
  ])('reports an unconfigured %s', (key, expectedConsequence) => {
    const findings = runPreflight(loadEnv({ ...FULLY_CONFIGURED, [key]: '' }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.keys).toContain(key);
    expect(findings[0]?.consequence).toMatch(expectedConsequence);
  });

  it('reports every gap when nothing optional is configured', () => {
    expect(
      keysOf({
        NODE_ENV: 'test',
        AUTH_SECRET: 'a-test-only-secret',
        DATABASE_URL: 'postgresql://db.internal:5432/coffee_ride',
        WEB_ORIGIN: 'https://rides.example.com',
      }),
    ).toEqual(
      expect.arrayContaining([
        'UNISENDER_API_KEY',
        'MAPS_2GIS_API_KEY',
        'REDIS_URL',
        'S3_ENDPOINT',
        'ERROR_REPORTING_WEBHOOK_URL',
      ]),
    );
  });

  // Every finding is printed to an operator and logged at boot: an empty
  // field would produce a report line that names a problem with no stated
  // consequence or no action to take.
  it('gives every finding a non-empty problem, consequence and action', () => {
    const findings = runPreflight(
      loadEnv({
        NODE_ENV: 'test',
        AUTH_SECRET: 'a-test-only-secret',
        DATABASE_URL: 'postgresql://db.internal:5432/coffee_ride',
        WEB_ORIGIN: 'https://rides.example.com',
      }),
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.severity).toBe('warning');
      expect(finding.keys.length).toBeGreaterThan(0);
      expect(finding.problem.length).toBeGreaterThan(0);
      expect(finding.consequence.length).toBeGreaterThan(0);
      expect(finding.action.length).toBeGreaterThan(0);
    }
  });

  // A warning tier must never change what boots. `loadEnv` is what refuses a
  // configuration; `runPreflight` only describes one.
  it('never throws, whatever it is given', () => {
    expect(() => runPreflight(loadEnv(FULLY_CONFIGURED))).not.toThrow();
  });
});
