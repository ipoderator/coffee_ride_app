import type { FastifyInstance } from 'fastify';
import type { Env } from '../env.js';
import {
  createGoogleOidcClient,
  type GoogleOidcClient,
} from '../modules/auth/google-client.js';

declare module 'fastify' {
  interface FastifyInstance {
    googleOidc: GoogleOidcClient | null;
  }
}

/**
 * CR-247 (ADR-034): apps/api's one Google OAuth composition point. Same
 * decorate-or-null shape as `plugins/strava.ts`: without both `GOOGLE_CLIENT_ID` and
 * `GOOGLE_CLIENT_SECRET`, `app.googleOidc` is `null`, `GET /v1/auth/google/status`
 * says `available: false` and the web app hides the button.
 */
export function registerGoogle(app: FastifyInstance, env: Env) {
  app.decorate(
    'googleOidc',
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? createGoogleOidcClient({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        })
      : null,
  );
}
