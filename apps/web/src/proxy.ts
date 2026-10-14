import { type NextRequest, NextResponse } from 'next/server';
import {
  isMaintenanceExempt,
  MAINTENANCE_PATH,
  maintenanceHeaders,
  readMaintenanceConfig,
} from '@/lib/site/maintenance';
import { contentSecurityPolicy } from '@/lib/security/headers';

// ADR-036 (KI-097): every page gets a fresh script nonce. The CSP goes on the
// request too — Next reads the nonce back from that header while rendering and
// stamps it on its own scripts — and `x-nonce` hands it to the root layout for
// the theme init script. A nonce only works on a page rendered per request,
// which is why the root layout reads `headers()` (every page is dynamic).
// The other security headers stay in `next.config.ts`'s `headers()`.
//
// CR-265: with `MAINTENANCE_MODE` on, every page answers `503` + `Retry-After`
// with the maintenance screen. Router prefetches and client-side navigations get
// the same rewrite: the App Router treats a non-2xx RSC reply as "load this page
// in full", which lands here as a document and shows the screen. (Next hides the
// RSC request headers from the proxy, so it cannot tell them apart anyway.)
export function proxy(request: NextRequest): NextResponse {
  const maintenance = readMaintenanceConfig();
  const gated =
    maintenance.enabled && !isMaintenanceExempt(request.nextUrl.pathname);

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

  const response = gated
    ? NextResponse.rewrite(new URL(MAINTENANCE_PATH, request.url), {
        status: 503,
        headers: maintenanceHeaders(maintenance),
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  return response;
}

export const config = {
  matcher: [
    {
      // `/api/*` keeps the API's own helmet headers (CR-205) and its own
      // maintenance gate (CR-265); built assets and optimized images are not
      // documents. Router prefetches come through too (CR-265: before, a
      // `missing` condition skipped them) — in maintenance a prefetch must not
      // cache a real page; otherwise their unused nonce costs nothing.
      source: '/((?!api/|_next/static|_next/image|favicon.ico).*)',
    },
  ],
};
