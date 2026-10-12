import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import type { Env } from '../../env.js';
import { requireAuth, resolveOptionalUser } from '../../plugins/auth.js';
import {
  completeStravaSync,
  startStravaSync,
  StravaServiceError,
  type StravaSyncConfig,
} from './strava.service.js';

// CR-234 (ADR-033). Both mutating steps are cheap for us but spend the app-wide Strava
// quota (100 reads / 15 min), so they get their own tighter per-IP tier.
const STRAVA_RATE_LIMIT = { max: 10, timeWindow: '1 minute' };

const rideIdParamsSchema = z.object({
  id: z.uuid('id must be a valid ride id.'),
});

const STRAVA_NOT_CONFIGURED = () =>
  new StravaServiceError(
    'strava_unavailable',
    503,
    'Strava sync unavailable',
    'Strava sync is not configured on this server.',
  );

function syncConfig(env: Env): StravaSyncConfig {
  return { authSecret: env.AUTH_SECRET, webOrigin: env.WEB_ORIGIN };
}

/** `POST /v1/rides/:id/strava-sync` — the participant's «Синхронизировать со Strava». */
export const rideStravaRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (
  app,
  opts,
) => {
  // `200 { authorizeUrl }`; `404 registration_not_found` without the caller's own
  // active registration, `409 ride_not_in_progress` before the start, `409
  // attendance_already_decided` once the organizer has decided, `503
  // strava_unavailable` when the server has no Strava application configured.
  app.post(
    '/:id/strava-sync',
    {
      schema: {
        params: rideIdParamsSchema,
        response: { 200: z.object({ authorizeUrl: z.string() }) },
      },
      preHandler: requireAuth,
      config: { rateLimit: STRAVA_RATE_LIMIT },
    },
    async (request, reply) => {
      if (!app.stravaClient) throw STRAVA_NOT_CONFIGURED();
      const authorizeUrl = await startStravaSync(
        app.db,
        app.stravaClient,
        syncConfig(opts.env),
        request.user!.id,
        request.params.id,
      );
      return reply.status(200).send({ authorizeUrl });
    },
  );
};

const callbackQuerySchema = z.object({
  code: z.string().max(512).optional(),
  state: z.string().max(1024).optional(),
  scope: z.string().max(256).optional(),
  error: z.string().max(256).optional(),
});

export const stravaRoutes: FastifyPluginAsyncZod<{ env: Env }> = async (
  app,
  opts,
) => {
  app.get(
    '/status',
    { schema: { response: { 200: z.object({ available: z.boolean() }) } } },
    async (_request, reply) =>
      reply.status(200).send({ available: app.stravaClient !== null }),
  );

  // Strava's redirect target (`WEB_ORIGIN/api/v1/strava/callback`, proxied by
  // apps/web like every `/api/v1/*` path). Always answers `303` to a page — the
  // browser is mid-navigation, so an error body would strand the participant.
  // `logLevel: 'warn'` keeps the single-use `code` out of the request log.
  app.get(
    '/callback',
    {
      schema: { querystring: callbackQuerySchema },
      preHandler: resolveOptionalUser,
      config: { rateLimit: STRAVA_RATE_LIMIT },
      logLevel: 'warn',
    },
    async (request, reply) => {
      const webOrigin = opts.env.WEB_ORIGIN;
      let target = new URL('/me/rides', webOrigin);
      let outcome = 'unavailable';
      if (app.stravaClient) {
        try {
          const result = await completeStravaSync(
            app.db,
            app.stravaClient,
            syncConfig(opts.env),
            request.user?.id ?? null,
            request.query,
            {
              warn: (message, error) =>
                request.log.warn({ err: error }, message),
              // `app.log`, not `request.log`: this route logs at `warn` so the
              // `code` stays out of the request log, which would drop `info`.
              info: (message, details) =>
                app.log.info({ reqId: request.id, ...details }, message),
            },
          );
          outcome = result.outcome;
          if (result.rideId) {
            target = new URL(`/rides/${result.rideId}`, webOrigin);
          }
        } catch (error) {
          app.reportError(error, 'Strava callback failed', {}, request.log);
          outcome = 'error';
        }
      }
      target.searchParams.set('strava', outcome);
      return reply.redirect(target.toString(), 303);
    },
  );
};
