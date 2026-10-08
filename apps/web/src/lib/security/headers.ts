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
// Scripts keep `'unsafe-inline'`: Next's per-page inline bootstrap
// (`self.__next_f.push(...)`) and the theme init script (`app/layout.tsx`)
// would each need a per-request nonce, which makes every page dynamic
// (`docs/decisions.md` would need an ADR for that trade). What the policy does
// stop: scripts, connections, frames, fonts and images from any other origin,
// `<base>`/`<object>` tricks, form posts elsewhere, and framing.
// Dev only: `'unsafe-eval'` (React's dev tooling) and `ws:` (hot reload).

const TWO_GIS = 'https://*.2gis.com';

export function contentSecurityPolicy({ dev }: { dev: boolean }): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      "'unsafe-inline'",
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
