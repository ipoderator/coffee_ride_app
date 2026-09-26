import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from '@fastify/type-provider-zod';
import type { Env } from './env.js';
import { generateRequestId } from './lib/request-id.js';
import { registerDb } from './plugins/db.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerErrorReporting } from './plugins/error-reporting.js';
import { registerOpenApi } from './plugins/openapi.js';
import { registerEmail } from './plugins/email.js';
import { registerMaps } from './plugins/maps.js';
import { registerS3 } from './plugins/s3.js';
import { registerSecurityHeaders } from './plugins/security-headers.js';
import { registerNotificationQueue } from './modules/notifications/queue.js';
import { healthRoutes } from './routes/health.js';
import { v1Routes } from './routes/v1.js';

// ADR-015 (CR-085/CR-027): hard upload size cap — the primary event-loop-blocking
// safeguard (see `modules/rides/gpx.ts`'s own comment for the streaming-parse half).
// 10 MB is generous for a real ride GPX track; anything larger is rejected before a
// single byte reaches the parser.
export const GPX_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/**
 * Builds (but does not start listening) the Fastify instance. Kept separate
 * from src/server.ts so tests (CR-008) can build an app against injected
 * config without binding a real port.
 */
export async function buildApp(env: Env) {
  const app = Fastify({
    logger: {
      // 'test' is silent (CR-008): buildApp() is called once per test case
      // via .inject(), and a pretty-printed transport per instance is both
      // noisy and needlessly slow (each spawns its own worker thread).
      level:
        env.NODE_ENV === 'production'
          ? 'info'
          : env.NODE_ENV === 'test'
            ? 'silent'
            : 'debug',
      // pino-pretty only in local dev — structured JSON logs are what a real
      // deployment's log pipeline wants, and 'test' doesn't need a transport
      // at all above.
      transport:
        env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
      // CR-079: once api/migrate/web all ship to one log pipeline, this is
      // what tells their lines apart.
      base: { service: 'api' },
    },
    // CR-079: correlates a request across the CR-075 Caddy -> web -> api hop
    // — Fastify's default genReqId is just a per-process counter, useless
    // for that. `lib/request-id.ts` validates/bounds the inbound header.
    genReqId: generateRequestId,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Echoes back whichever request id was actually used (inbound, reused, or
  // freshly generated) so a caller/proxy can see it for correlation.
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-request-id', request.id);
    return payload;
  });

  // Must exist before registerErrorHandler/registerNotificationQueue, both
  // of which call app.reportError.
  registerErrorReporting(app, env);
  registerErrorHandler(app);
  // CR-061: global, before every route is registered — applies to
  // `/health`, `/docs`, and `/v1/*` alike (`.claude/rules/security.md`).
  await registerSecurityHeaders(app);
  await registerOpenApi(app);
  registerDb(app, env);
  registerS3(app, env);
  registerEmail(app, env);
  registerMaps(app, env);
  // Needs app.db/app.emailProvider (worker's job processor reads/writes
  // notifications and sends email) — must come after registerDb/registerEmail.
  registerNotificationQueue(app, env);

  // CR-027: GPX file uploads. `fileSize` is the actual event-loop-protection
  // mechanism (ADR-015) — everything past this limit is rejected by the plugin
  // before `modules/rides/gpx.ts` ever sees it.
  await app.register(multipart, {
    limits: { fileSize: GPX_MAX_UPLOAD_BYTES, files: 1 },
  });

  // CR-012: the session cookie carries only an opaque token — its value is
  // never trusted on its own, only looked up against `sessions.tokenHash`
  // (`plugins/auth.ts`) — so no `secret` option (Fastify's signed-cookie
  // support) is needed here.
  await app.register(cookie);

  // Lenient global default; auth routes override it with a stricter
  // per-route tier via `config.rateLimit` (`.claude/rules/security.md`).
  // CR-058: backed by `app.redis` (registerNotificationQueue, above) when
  // `REDIS_URL` is configured — shared across instances instead of each
  // process counting independently; falls back to the plugin's own
  // in-memory store otherwise (KI-014's remaining unconfigured-Redis case).
  // `skipOnError: true` applies to every rate-limited route, not just auth:
  // a degraded Redis must never turn into a false 429 blocking a critical
  // journey (`.claude/rules/resilience.md`) — only the shared-counter
  // protection is lost, same fail-open choice `lib/account-rate-limit.ts`
  // makes for the per-account tier.
  // CR-135: `env.RATE_LIMIT_MAX` is the test/dev-only override (refused in
  // production by `loadEnv()`).
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX ?? 100,
    timeWindow: '1 minute',
    ...(app.redis ? { redis: app.redis } : {}),
    skipOnError: true,
  });

  await app.register(healthRoutes);
  await app.register(v1Routes, { prefix: '/v1', env });

  return app;
}
