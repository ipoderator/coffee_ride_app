import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy, PERMISSIONS_POLICY } from './headers';

function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((directive) => {
      const [name, ...sources] = directive.split(' ');
      return [name!, sources];
    }),
  );
}

describe('contentSecurityPolicy', () => {
  const production = directives(
    contentSecurityPolicy({ dev: false, nonce: 'abc123==' }),
  );

  it('keeps CR-205’s framing, base and object directives', () => {
    expect(production.get('frame-ancestors')).toEqual(["'none'"]);
    expect(production.get('base-uri')).toEqual(["'self'"]);
    expect(production.get('object-src')).toEqual(["'none'"]);
  });

  it('trusts scripts by the request’s nonce, never inline by default (ADR-036)', () => {
    expect(production.get('script-src')).toEqual([
      "'self'",
      "'nonce-abc123=='",
      "'strict-dynamic'",
      'https://mapgl.2gis.com',
      'https://www.google.com/recaptcha/',
      'https://www.gstatic.com/recaptcha/',
      'blob:',
    ]);
    expect(production.get('default-src')).toEqual(["'self'"]);
    expect(production.get('form-action')).toEqual(["'self'"]);
  });

  it('lets the map reach its tile, style and key hosts and start its workers', () => {
    expect(production.get('connect-src')).toContain('https://*.2gis.com');
    expect(production.get('img-src')).toContain('https://*.2gis.com');
    expect(production.get('worker-src')).toEqual(["'self'", 'blob:']);
  });

  it('allows Google reCAPTCHA only by its paths (CR-261)', () => {
    expect(production.get('frame-src')).toEqual([
      'https://www.google.com/recaptcha/',
      'https://recaptcha.google.com/recaptcha/',
    ]);
    expect(production.get('connect-src')).toContain(
      'https://www.google.com/recaptcha/',
    );
    // Never a whole Google host.
    for (const sources of production.values()) {
      expect(sources).not.toContain('https://www.google.com');
      expect(sources).not.toContain('https://*.google.com');
    }
  });

  it('adds eval and hot-reload sockets in development only', () => {
    expect(production.get('script-src')).not.toContain("'unsafe-eval'");
    expect(production.get('connect-src')).not.toContain('ws:');
    const dev = directives(contentSecurityPolicy({ dev: true, nonce: 'n' }));
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
    expect(dev.get('connect-src')).toContain('ws:');
  });
});

describe('PERMISSIONS_POLICY', () => {
  it('turns off device features and keeps share/clipboard for this origin', () => {
    expect(PERMISSIONS_POLICY).toContain('camera=()');
    expect(PERMISSIONS_POLICY).toContain('geolocation=()');
    expect(PERMISSIONS_POLICY).toContain('web-share=(self)');
    expect(PERMISSIONS_POLICY).toContain('clipboard-write=(self)');
  });
});
