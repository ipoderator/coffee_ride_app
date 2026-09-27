// CR-141 (KI-064): the `?next=` return target carried through `/login` and
// `/register`, so a visitor sent to sign in from a ride lands back on it.
//
// `next` is attacker-controllable (anyone can craft a `/login?next=…` link),
// so this is the one place it is validated — open-redirect protection. Only a
// same-origin relative path survives; everything else falls back to the
// caller's default. Checked twice: by the page before rendering, and again by
// the form right before it navigates.

const MAX_NEXT_LENGTH = 512;

// Parsing base only — never navigated to. A relative path resolved against it
// must keep this origin; anything that escapes it (`//host`, `https:…`) is
// rejected.
const PARSE_BASE = 'http://next-path.invalid';

// Returning to a sign-in page after signing in would loop.
const AUTH_PAGES = ['/login', '/register'];

/** Where a successful sign-in lands when there is no usable `next`. */
export const DEFAULT_AFTER_LOGIN = '/me';

function hasUnsafeCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    // Control characters (URL parsers strip tab/newline, which can turn
    // `/\t/evil.example` into `//evil.example`) and backslashes (browsers
    // treat `/\evil.example` as protocol-relative).
    if (code < 0x20 || code === 0x7f || value[i] === '\\') return true;
  }
  return false;
}

/**
 * `raw` as a normalized same-origin path (`/rides/abc?x=1#y`), or `null` when
 * it is missing, not a string, absolute, protocol-relative, overlong,
 * contains control characters/backslashes, or points at `/login`/`/register`.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length === 0 || raw.length > MAX_NEXT_LENGTH) return null;
  if (!raw.startsWith('/') || raw.startsWith('//')) return null;
  if (hasUnsafeCharacter(raw)) return null;

  let url: URL;
  try {
    url = new URL(raw, PARSE_BASE);
  } catch {
    return null;
  }
  if (url.origin !== PARSE_BASE) return null;

  // Checked after parsing, so `/rides/../login` can't slip past as a
  // different-looking string.
  const isAuthPage = AUTH_PAGES.some(
    (page) => url.pathname === page || url.pathname.startsWith(`${page}/`),
  );
  if (isAuthPage) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

function withNext(page: string, next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe ? `${page}?next=${encodeURIComponent(safe)}` : page;
}

/** `/login`, carrying `next` when it is a safe return target. */
export function loginHref(next?: string | null): string {
  return withNext('/login', next);
}

/** `/register`, carrying `next` when it is a safe return target. */
export function registerHref(next?: string | null): string {
  return withNext('/register', next);
}
