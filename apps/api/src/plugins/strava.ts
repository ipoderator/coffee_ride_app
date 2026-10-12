import type { FastifyInstance } from 'fastify';
import type { Env } from '../env.js';
import {
  createStravaClient,
  type StravaClient,
} from '../modules/strava/strava-client.js';

declare module 'fastify' {
  interface FastifyInstance {
    stravaClient: StravaClient | null;
  }
}

/**
 * CR-234 (ADR-033): apps/api's one Strava composition point. Same decorate-or-null
 * shape as `plugins/maps.ts`: without both `STRAVA_CLIENT_ID` and
 * `STRAVA_CLIENT_SECRET`, `app.stravaClient` is `null`, `GET /v1/strava/status`
 * says `available: false` and the web app hides the button.
 */
export function registerStrava(app: FastifyInstance, env: Env) {
  app.decorate(
    'stravaClient',
    env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET
      ? createStravaClient({
          clientId: env.STRAVA_CLIENT_ID,
          clientSecret: env.STRAVA_CLIENT_SECRET,
        })
      : null,
  );
}
