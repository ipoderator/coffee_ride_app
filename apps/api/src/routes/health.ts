import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

// GET /health — unversioned by design (ADR-011, docs/api.md): consumed by the
// deployment platform, not by product clients, and has no reason to move when
// the product contract changes.
//
// This is a bootstrap-only stub: no DB/Redis/S3 dependency checks. CR-051
// ("Health check endpoint reporting DB/Redis/S3 status") replaces the handler
// body with real checks — same route, same unversioned contract position,
// still must not fail hard if one dependency is degraded.
export async function healthRoutes(app: FastifyInstance) {
  app.get(
    '/health',
    {
      schema: {
        response: {
          200: z.object({ status: z.literal('ok') }),
        },
      },
    },
    async () => ({ status: 'ok' as const }),
  );
}
