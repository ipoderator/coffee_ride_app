import type { FastifyInstance } from 'fastify';
import type { Env } from '../env.js';
import {
  createRecaptchaVerifier,
  type RecaptchaVerifier,
} from '../modules/auth/recaptcha-client.js';

declare module 'fastify' {
  interface FastifyInstance {
    recaptcha: RecaptchaVerifier | null;
  }
}

/**
 * CR-261 (ADR-038): apps/api's one reCAPTCHA composition point. Same
 * decorate-or-null shape as `plugins/google.ts`: without `RECAPTCHA_SECRET_KEY`,
 * `app.recaptcha` is `null` and register/login/forgot-password ask for no token
 * (local dev, tests, e2e); the preflight warns about it in production.
 */
export function registerRecaptcha(app: FastifyInstance, env: Env) {
  app.decorate(
    'recaptcha',
    env.RECAPTCHA_SECRET_KEY
      ? createRecaptchaVerifier({ secretKey: env.RECAPTCHA_SECRET_KEY })
      : null,
  );
}
