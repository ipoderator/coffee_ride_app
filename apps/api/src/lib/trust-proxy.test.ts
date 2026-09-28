import { describe, expect, it } from 'vitest';
import { createTrustProxy, isPrivateAddress } from './trust-proxy.js';

describe('isPrivateAddress (KI-044)', () => {
  it.each([
    '10.1.2.3',
    '172.18.0.5',
    '192.168.1.1',
    '127.0.0.1',
    '::1',
    'fd12:3456::1',
    '::ffff:172.18.0.5',
    '::FFFF:127.0.0.1',
  ])('%s is private', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each([
    '203.0.113.7',
    '172.32.0.1',
    '8.8.8.8',
    '2001:db8::1',
    '::ffff:8.8.8.8',
    'not-an-ip',
  ])('%s is not private', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe('createTrustProxy (KI-044)', () => {
  it('trusts nothing when no hop count is configured', () => {
    expect(createTrustProxy(undefined)).toBe(false);
    expect(createTrustProxy(0)).toBe(false);
  });

  it('trusts only the first `hops` addresses, and only private ones', () => {
    const trust = createTrustProxy(1);
    expect(trust).not.toBe(false);
    if (!trust) return;
    expect(trust('172.18.0.5', 0)).toBe(true);
    expect(trust('10.0.0.1', 1)).toBe(false);
    expect(trust('198.51.100.20', 0)).toBe(false);
  });
});
