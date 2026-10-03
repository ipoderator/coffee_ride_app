import { describe, expect, it } from 'vitest';
import {
  loginHref,
  registerHref,
  safeNextPath,
  verifyEmailHref,
} from './next-path';

describe('safeNextPath (CR-141)', () => {
  it.each([
    ['/rides/abc', '/rides/abc'],
    ['/rides/abc/riders/r1', '/rides/abc/riders/r1'],
    ['/?view=map', '/?view=map'],
    ['/me/registrations#upcoming', '/me/registrations#upcoming'],
    // Normalized by the URL parser before the auth-page check.
    ['/rides/../me', '/me'],
  ])('keeps the same-origin path %s', (raw, expected) => {
    expect(safeNextPath(raw)).toBe(expected);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['an array (repeated ?next=)', ['/rides/a', '/rides/b']],
    ['empty', ''],
    ['not rooted', 'rides/abc'],
    ['absolute https', 'https://evil.example/rides'],
    ['javascript:', 'javascript:alert(1)'],
    ['protocol-relative', '//evil.example'],
    ['backslash protocol-relative', '/\\evil.example'],
    ['tab smuggling', '/\t/evil.example'],
    ['newline', '/rides\n/abc'],
    ['the login page', '/login'],
    ['the login page with a query', '/login?next=/rides/a'],
    ['the register page', '/register'],
    ['a login page reached by dot segments', '/rides/../login'],
    ['the verify-email page (CR-197)', '/verify-email?token=abc'],
    ['overlong', `/${'a'.repeat(600)}`],
  ])('rejects %s', (_label, raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });
});

describe('loginHref / registerHref (CR-141)', () => {
  it('carries a safe next, encoded', () => {
    expect(loginHref('/rides/abc?x=1')).toBe(
      '/login?next=%2Frides%2Fabc%3Fx%3D1',
    );
    expect(registerHref('/rides/abc')).toBe('/register?next=%2Frides%2Fabc');
  });

  it('drops an unsafe or missing next', () => {
    expect(loginHref('//evil.example')).toBe('/login');
    expect(loginHref(null)).toBe('/login');
    expect(registerHref()).toBe('/register');
  });
});

describe('verifyEmailHref (CR-197)', () => {
  it('keeps the token and appends a safe next', () => {
    expect(verifyEmailHref('a b&c', '/rides/abc')).toBe(
      '/verify-email?token=a%20b%26c&next=%2Frides%2Fabc',
    );
  });

  it('drops an unsafe or missing next', () => {
    expect(verifyEmailHref('tok', 'https://evil.example')).toBe(
      '/verify-email?token=tok',
    );
    expect(verifyEmailHref('tok', '/\\evil.example')).toBe(
      '/verify-email?token=tok',
    );
    expect(verifyEmailHref('tok')).toBe('/verify-email?token=tok');
  });
});
