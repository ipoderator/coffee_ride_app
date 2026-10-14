import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config, proxy } from './proxy';

function nonceOf(policy: string | null): string | undefined {
  return /'nonce-([^']+)'/.exec(policy ?? '')?.[1];
}

describe('proxy (ADR-036)', () => {
  it('puts a fresh nonce in the CSP and hands it to the render', () => {
    const response = proxy(new NextRequest('http://localhost/rides'));
    const policy = response.headers.get('content-security-policy');
    const nonce = nonceOf(policy);

    expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(policy).toContain("'strict-dynamic'");
    expect(policy).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    // `NextResponse.next({ request })` forwards overridden request headers
    // to the render as `x-middleware-request-*`.
    expect(response.headers.get('x-middleware-request-x-nonce')).toBe(nonce);
    expect(
      response.headers.get('x-middleware-request-content-security-policy'),
    ).toBe(policy);
  });

  it('never reuses a nonce across requests', () => {
    const first = proxy(new NextRequest('http://localhost/'));
    const second = proxy(new NextRequest('http://localhost/'));
    expect(nonceOf(first.headers.get('content-security-policy'))).not.toBe(
      nonceOf(second.headers.get('content-security-policy')),
    );
  });
});

// CR-265: `MAINTENANCE_MODE` — every page rewritten to `/maintenance` with 503.
describe('proxy in maintenance (CR-265)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes pages through untouched when the mode is off', () => {
    const response = proxy(new NextRequest('http://localhost/rides'));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('retry-after')).toBeNull();
  });

  it.each(['/', '/rides/abc?x=1', '/login', '/me', '/organizer/rides'])(
    'answers %s with the maintenance screen, 503 and Retry-After',
    (path) => {
      vi.stubEnv('MAINTENANCE_MODE', 'true');
      vi.stubEnv('MAINTENANCE_RETRY_AFTER_SECONDS', '120');
      const response = proxy(new NextRequest(`http://localhost${path}`));

      expect(response.status).toBe(503);
      expect(response.headers.get('x-middleware-rewrite')).toBe(
        'http://localhost/maintenance',
      );
      expect(response.headers.get('retry-after')).toBe('120');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('x-robots-tag')).toBe('noindex');
      // The screen still gets its nonce and CSP.
      const policy = response.headers.get('content-security-policy');
      expect(response.headers.get('x-middleware-request-x-nonce')).toBe(
        nonceOf(policy),
      );
    },
  );

  it.each(['/robots.txt', '/icon.svg'])('leaves %s reachable', (path) => {
    vi.stubEnv('MAINTENANCE_MODE', 'true');
    const response = proxy(new NextRequest(`http://localhost${path}`));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('retry-after')).toBeNull();
  });

  it('never runs for the API, built assets or the favicon', () => {
    const source = new RegExp(`^${config.matcher[0]!.source}$`);
    for (const path of [
      '/api/v1/rides',
      '/api/v1/auth/yandex/callback',
      '/_next/static/chunks/app.js',
      '/_next/image',
      '/favicon.ico',
    ]) {
      expect(source.test(path)).toBe(false);
    }
    for (const path of ['/', '/rides', '/maintenance', '/robots.txt']) {
      expect(source.test(path)).toBe(true);
    }
  });
});
