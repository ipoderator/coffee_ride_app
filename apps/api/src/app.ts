import Fastify from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from '@fastify/type-provider-zod';
import type { Env } from './env.js';
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
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      // pino-pretty only outside production — structured JSON logs are what a
      // real deployment's log pipeline wants (CR-079 builds on this later).
      transport:
        env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' },
    },
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);
  await registerOpenApi(app);

  await app.register(healthRoutes);
  await app.register(v1Routes, { prefix: '/v1' });

  return app;
}
