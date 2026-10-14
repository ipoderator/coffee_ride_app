import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

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
