// QA live audit 2026-10-08, item 8 (CR-205 follow-up): the pages' CSP grew
// from three framing/base/object directives into a full allowlist, built from
// what the pages actually load (inventoried in a browser on the catalog map and
// a ride page):
//
// - everything of our own — HTML, `_next` scripts/styles/fonts, `/api/v1/*`
//   (same origin through `next.config.ts`'s rewrite) — is `'self'`;
// - 2GIS MapGL: its script from `mapgl.2gis.com`, then fetch/XHR to
//   `keys.api`, `styles.api`, `disk`, `mapgl` and `tile{0-3}-sdk.maps` — all
//   `*.2gis.com`; its workers start from `blob:` URLs.
//
// Scripts (ADR-036, KI-097): a fresh per-request nonce plus `'strict-dynamic'`,
// set by `src/proxy.ts`. Next stamps the nonce on its own bootstrap and chunk
// scripts (it reads it back from the request's CSP header) and the root layout
// passes it to the theme init script; a script those trusted scripts create —
// MapGL's loader appends its `<script>` with `createElement` — inherits the
// trust. No `'unsafe-inline'`: an injected inline `<script>` cannot run.
// `'self'`, the MapGL host and `blob:` stay as the fallback for browsers
// without `'strict-dynamic'` (CSP3 browsers ignore them next to it). Styles
// keep `'unsafe-inline'`: a nonce there would also switch off the inline
// `style` attributes React and MapGL set. What else the policy stops: scripts,
// connections, frames, fonts and images from any other origin, `<base>`/
// `<object>` tricks, form posts elsewhere, and framing.
// Dev only: `'unsafe-eval'` (React's dev tooling) and `ws:` (hot reload).

const TWO_GIS = 'https://*.2gis.com';

export function contentSecurityPolicy({
  dev,
  nonce,
}: {
  dev: boolean;
  nonce: string;
}): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
      'https://mapgl.2gis.com',
      'blob:',
    ],
    'worker-src': ["'self'", 'blob:'],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', TWO_GIS],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", TWO_GIS, ...(dev ? ['ws:'] : [])],
    'frame-src': ["'none'"],
    'frame-ancestors': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'object-src': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

// QA live audit 2026-10-08, item 8: every powerful feature off, except the
// two the ride page uses — «Поделиться» (Web Share) and its clipboard
// fallback — and fullscreen, kept for our own origin.
export const PERMISSIONS_POLICY = [
  'camera=()',
  'microphone=()',
  'geolocation=()',
  'payment=()',
  'usb=()',
  'serial=()',
  'bluetooth=()',
  'hid=()',
  'midi=()',
  'magnetometer=()',
  'gyroscope=()',
  'accelerometer=()',
  'display-capture=()',
  'browsing-topics=()',
  'web-share=(self)',
  'clipboard-write=(self)',
  'fullscreen=(self)',
].join(', ');
