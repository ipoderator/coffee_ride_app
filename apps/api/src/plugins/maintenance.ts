import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Env } from '../env.js';

// CR-265: the provider redirects still land during maintenance — a sign-in or a
// Strava sync started a minute earlier finishes (or fails into its own
// `/login?oauth=…` reply) instead of leaving the browser on a JSON 503. Exact
// route patterns, not prefixes. (`routeOptions.url` is always set here: the hook runs
// only for a matched route.)
const MAINTENANCE_EXEMPT_ROUTES = new Set<string | undefined>([
  '/v1/auth/google/callback',
  '/v1/auth/yandex/callback',
  '/v1/strava/callback',
]);

/**
 * CR-265: planned maintenance (`MAINTENANCE_MODE`). Registered inside `v1Routes`
 * like the CSRF check, so `/health` and `/docs` — outside `/v1` — keep answering;
 * every other `/v1/*` request gets `503 maintenance` with `Retry-After`, before
 * auth, validation or any database work. A route the API doesn't know still gets
 * its ordinary 404 (Fastify's not-found handler, not this hook).
 */
export function registerMaintenance(app: FastifyInstance, env: Env) {
  if (!env.MAINTENANCE_MODE) return;
  const retryAfter = String(env.MAINTENANCE_RETRY_AFTER_SECONDS);

  app.addHook(
    'onRequest',
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (MAINTENANCE_EXEMPT_ROUTES.has(request.routeOptions.url)) return;

      return reply
        .status(503)
        .header('retry-after', retryAfter)
        .header('cache-control', 'no-store')
        .type('application/problem+json')
        .send({
          type: 'https://coffee-ride.example/errors/maintenance',
          title: 'Service Unavailable',
          status: 503,
          detail: 'Planned maintenance is in progress. Retry later.',
          instance: request.url.split('?')[0],
          code: 'maintenance',
        });
    },
  );
}
