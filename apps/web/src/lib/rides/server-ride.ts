import { headers } from 'next/headers';
import { cache } from 'react';
import type { GetRideResponse } from 'types';
import { API_INTERNAL_URL } from '@/lib/site/site-url';

// QA live audit 2026-10-08, item 4: `/rides/[id]` answered `200` for a ride
// that does not exist and said so only after the client's own fetch — a
// soft 404. The page now asks `apps/api` first, server to server, and calls
// `notFound()` on its `404`; `RideDetailView` still loads and renders the ride
// itself, so this lookup only decides the status code and the metadata.
//
// The API stays the authority on visibility (a draft is `404` to everyone but
// its owner): the viewer's own cookies go along, and their address
// (`X-Forwarded-For`) so `apps/api`'s per-IP limits see them, not `web`.
// `API_INTERNAL_URL` is the same server-only origin `next.config.ts` rewrites
// `/api/v1/*` to (`apps/web/Dockerfile` sets it in the runner stage too).

// Long enough for a cold API, short enough not to hold the page: a timeout
// or any non-404 answer falls through to the client render, which has its
// own loading/error states.
const LOOKUP_TIMEOUT_MS = 3_000;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ServerRideLookup =
  | { kind: 'found'; ride: GetRideResponse['ride'] }
  | { kind: 'not_found' }
  | { kind: 'unknown' };

/** One lookup per request — `generateMetadata` and the page share it. */
export const lookupRide = cache(
  async (id: string): Promise<ServerRideLookup> => {
    // `GET /v1/rides/:id` rejects a non-UUID with `400`; no ride can live there.
    if (!UUID_PATTERN.test(id)) return { kind: 'not_found' };

    const incoming = await headers();
    const forwarded: Record<string, string> = { accept: 'application/json' };
    const cookie = incoming.get('cookie');
    if (cookie) forwarded.cookie = cookie;
    const forwardedFor = incoming.get('x-forwarded-for');
    if (forwardedFor) forwarded['x-forwarded-for'] = forwardedFor;

    try {
      const response = await fetch(`${API_INTERNAL_URL}/v1/rides/${id}`, {
        headers: forwarded,
        cache: 'no-store',
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      });
      if (response.status === 404) return { kind: 'not_found' };
      if (!response.ok) return { kind: 'unknown' };
      const body = (await response.json()) as GetRideResponse;
      return { kind: 'found', ride: body.ride };
    } catch {
      return { kind: 'unknown' };
    }
  },
);
