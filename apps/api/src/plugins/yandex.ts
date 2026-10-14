import type { FastifyInstance } from 'fastify';
import type { Env } from '../env.js';
import {
  createYandexOAuthClient,
  type YandexOAuthClient,
} from '../modules/auth/yandex-client.js';

declare module 'fastify' {
  interface FastifyInstance {
    yandexOAuth: YandexOAuthClient | null;
  }
}

/**
 * CR-260 (ADR-037): apps/api's one Yandex ID composition point, shaped like
 * `plugins/google.ts`: without both `YANDEX_CLIENT_ID` and `YANDEX_CLIENT_SECRET`,
 * `app.yandexOAuth` is `null`, `GET /v1/auth/yandex/status` says `available: false`
 * and the web app hides the button.
 */
export function registerYandex(app: FastifyInstance, env: Env) {
  app.decorate(
    'yandexOAuth',
    env.YANDEX_CLIENT_ID && env.YANDEX_CLIENT_SECRET
      ? createYandexOAuthClient({
          clientId: env.YANDEX_CLIENT_ID,
          clientSecret: env.YANDEX_CLIENT_SECRET,
        })
      : null,
  );
}
