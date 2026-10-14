import { type NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy } from '@/lib/security/headers';

// ADR-036 (KI-097): every page gets a fresh script nonce. The CSP goes on the
// request too — Next reads the nonce back from that header while rendering and
// stamps it on its own scripts — and `x-nonce` hands it to the root layout for
// the theme init script. A nonce only works on a page rendered per request,
// which is why the root layout reads `headers()` (every page is dynamic).
// The other security headers stay in `next.config.ts`'s `headers()`.
export function proxy(request: NextRequest): NextResponse {
  const nonce = Buffer.from(
    crypto.getRandomValues(new Uint8Array(16)),
  ).toString('base64');
  const policy = contentSecurityPolicy({
    dev: process.env.NODE_ENV !== 'production',
    nonce,
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      // `/api/*` keeps the API's own helmet headers (CR-205); built assets and
      // optimized images are not documents. Router prefetches carry no HTML.
      source: '/((?!api/|_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
