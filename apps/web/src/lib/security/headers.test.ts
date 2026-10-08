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
  const production = directives(contentSecurityPolicy({ dev: false }));

  it('keeps CR-205’s framing, base and object directives', () => {
    expect(production.get('frame-ancestors')).toEqual(["'none'"]);
    expect(production.get('base-uri')).toEqual(["'self'"]);
    expect(production.get('object-src')).toEqual(["'none'"]);
  });

  it('allows scripts from this origin and 2GIS MapGL only', () => {
    expect(production.get('script-src')).toEqual([
      "'self'",
      "'unsafe-inline'",
      'https://mapgl.2gis.com',
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

  it('adds eval and hot-reload sockets in development only', () => {
    expect(production.get('script-src')).not.toContain("'unsafe-eval'");
    expect(production.get('connect-src')).not.toContain('ws:');
    const dev = directives(contentSecurityPolicy({ dev: true }));
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
