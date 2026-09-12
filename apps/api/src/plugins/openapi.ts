import type { FastifyInstance } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { jsonSchemaTransform } from '@fastify/type-provider-zod';

// CLAUDE.md fixes the stack as "REST + OpenAPI" — wired at bootstrap (CR-003)
// rather than deferred, since @fastify/type-provider-zod (needed anyway for
// typed Zod route validation) already generates the OpenAPI schema from route
// Zod schemas via `jsonSchemaTransform`. The spec starts empty (no domain
// routes exist yet) and grows automatically as CR-011+ add routes with Zod
// schemas — no separate OpenAPI file to keep in sync by hand.
export async function registerOpenApi(app: FastifyInstance) {
  await app.register(fastifySwagger, {
    openapi: {
      info: {
        title: 'Coffee Ride API',
        version: '1.0.0',
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(fastifySwaggerUi, {
    routePrefix: '/docs',
  });
}
