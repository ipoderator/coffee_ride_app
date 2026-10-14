import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETRY_AFTER_SECONDS,
  isMaintenanceExempt,
  maintenanceHeaders,
  readMaintenanceConfig,
} from './maintenance';

// CR-265: the same parsing as apps/api's `env.ts` (`maintenance.test.ts` there).
describe('readMaintenanceConfig', () => {
  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['0', false],
    ['on', false],
    ['true', true],
    ['True', true],
    ['1', true],
    [' 1 ', true],
  ])('MAINTENANCE_MODE=%j → %s', (value, enabled) => {
    expect(readMaintenanceConfig({ MAINTENANCE_MODE: value }).enabled).toBe(
      enabled,
    );
  });

  it.each([
    [undefined, DEFAULT_RETRY_AFTER_SECONDS],
    ['', DEFAULT_RETRY_AFTER_SECONDS],
    ['soon', DEFAULT_RETRY_AFTER_SECONDS],
    ['0', DEFAULT_RETRY_AFTER_SECONDS],
    ['-1', DEFAULT_RETRY_AFTER_SECONDS],
    ['1.5', DEFAULT_RETRY_AFTER_SECONDS],
    ['86401', DEFAULT_RETRY_AFTER_SECONDS],
    ['1', 1],
    ['900', 900],
    ['86400', 86400],
  ])('MAINTENANCE_RETRY_AFTER_SECONDS=%j → %d', (value, seconds) => {
    expect(
      readMaintenanceConfig({ MAINTENANCE_RETRY_AFTER_SECONDS: value })
        .retryAfterSeconds,
    ).toBe(seconds);
  });

  it('defaults to 600 seconds', () => {
    expect(DEFAULT_RETRY_AFTER_SECONDS).toBe(600);
  });
});

describe('isMaintenanceExempt', () => {
  it.each(['/robots.txt', '/icon.svg'])('lets %s through', (path) => {
    expect(isMaintenanceExempt(path)).toBe(true);
  });

  it.each([
    '/',
    '/rides',
    '/login',
    '/maintenance',
    '/robots.txt/x',
    '/sitemap.xml',
  ])('gates %s', (path) => {
    expect(isMaintenanceExempt(path)).toBe(false);
  });
});

describe('maintenanceHeaders', () => {
  it('asks to retry later, not to cache and not to index', () => {
    expect(
      maintenanceHeaders({ enabled: true, retryAfterSeconds: 120 }),
    ).toEqual({
      'Retry-After': '120',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex',
    });
  });
});
