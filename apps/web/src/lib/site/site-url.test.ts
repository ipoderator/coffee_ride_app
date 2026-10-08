import { afterEach, describe, expect, it, vi } from 'vitest';
import { siteUrl } from './site-url';

afterEach(() => vi.unstubAllEnvs());

describe('siteUrl', () => {
  it('reads SITE_URL', () => {
    vi.stubEnv('SITE_URL', 'https://coffeeride.site');
    expect(siteUrl().toString()).toBe('https://coffeeride.site/');
  });

  it('falls back to local dev when unset or malformed', () => {
    vi.stubEnv('SITE_URL', '');
    expect(siteUrl().toString()).toBe('http://localhost:3000/');
    vi.stubEnv('SITE_URL', 'not a url');
    expect(siteUrl().toString()).toBe('http://localhost:3000/');
  });
});
