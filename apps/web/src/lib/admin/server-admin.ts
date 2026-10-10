import { headers } from 'next/headers';
import { API_INTERNAL_URL } from '@/lib/site/site-url';

// CR-231 (ADR-032): the `/admin` layout's server-side gate. `apps/api` stays the
// authority (`GET /v1/admin/me` → 404 for anyone without the capability); the
// viewer's cookies travel along, same as `@/lib/rides/server-ride.ts`. Every
// admin call is still authorized by the API on its own — this only decides
// whether the section renders or answers a real 404.

const LOOKUP_TIMEOUT_MS = 3_000;

export type AdminAccess = 'admin' | 'denied' | 'unknown';

export async function lookupAdminAccess(): Promise<AdminAccess> {
  const incoming = await headers();
  const cookie = incoming.get('cookie');
  if (!cookie) return 'denied';

  const forwarded: Record<string, string> = {
    accept: 'application/json',
    cookie,
  };
  const forwardedFor = incoming.get('x-forwarded-for');
  if (forwardedFor) forwarded['x-forwarded-for'] = forwardedFor;

  try {
    const response = await fetch(`${API_INTERNAL_URL}/v1/admin/me`, {
      headers: forwarded,
      cache: 'no-store',
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    if (response.ok) return 'admin';
    if (response.status === 401 || response.status === 404) return 'denied';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}
