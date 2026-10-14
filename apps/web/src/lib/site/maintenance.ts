// CR-265: planned maintenance, switched by env on the `web` container (Compose
// passes the same pair to `api`, whose `env.ts` parses it identically). Server-only:
// read per request by `src/proxy.ts` and the root layout, so flipping it is an env
// change and a container restart — never a rebuild. Anything but `true`/`1` (unset,
// empty, a typo) keeps the site serving.

export const DEFAULT_RETRY_AFTER_SECONDS = 600;
const MAX_RETRY_AFTER_SECONDS = 86_400;

export interface MaintenanceConfig {
  enabled: boolean;
  /** `Retry-After`, in seconds. */
  retryAfterSeconds: number;
}

export function readMaintenanceConfig(
  env: Record<string, string | undefined> = process.env,
): MaintenanceConfig {
  const enabled = ['1', 'true'].includes(
    (env.MAINTENANCE_MODE ?? '').trim().toLowerCase(),
  );
  const raw = (env.MAINTENANCE_RETRY_AFTER_SECONDS ?? '').trim();
  const seconds = /^\d+$/.test(raw) ? Number(raw) : NaN;
  return {
    enabled,
    retryAfterSeconds:
      seconds >= 1 && seconds <= MAX_RETRY_AFTER_SECONDS
        ? seconds
        : DEFAULT_RETRY_AFTER_SECONDS,
  };
}

/** Where the proxy renders the maintenance screen. */
export const MAINTENANCE_PATH = '/maintenance';

// Files a browser or crawler fetches outside a page that must keep answering.
// `/_next/static`, `/_next/image`, `/favicon.ico` and `/api/*` never reach the
// proxy at all (its matcher); the API applies its own gate.
const EXEMPT_PATHS = new Set(['/robots.txt', '/icon.svg']);

export function isMaintenanceExempt(pathname: string): boolean {
  return EXEMPT_PATHS.has(pathname);
}

/** The headers every maintenance answer carries, page or not. */
export function maintenanceHeaders(
  config: MaintenanceConfig,
): Record<string, string> {
  return {
    'Retry-After': String(config.retryAfterSeconds),
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex',
  };
}
