import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from '@fastify/type-provider-zod';
import type { Env } from './env.js';
import { registerDb } from './plugins/db.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerOpenApi } from './plugins/openapi.js';
import { healthRoutes } from './routes/health.js';
import { v1Routes } from './routes/v1.js';

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
      // deployment's log pipeline wants (CR-079 builds on this later), and
      // 'test' doesn't need a transport at all above.
      transport:
        env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);
  await registerOpenApi(app);
  registerDb(app, env);

  // Lenient global default (in-memory store — see auth.routes.ts's own comment
  // on why not Redis yet); auth routes override it with a stricter per-route
  // tier via `config.rateLimit` (`.claude/rules/security.md`).
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  await app.register(healthRoutes);
  await app.register(v1Routes, { prefix: '/v1', env });

  return app;
}
