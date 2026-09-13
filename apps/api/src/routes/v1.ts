import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { Env } from '../env.js';
import { authRoutes } from '../modules/auth/auth.routes.js';

// Versioned root (ADR-011): every product endpoint lives under /v1. Future
// feature modules (rides, routes, registrations, ...) register themselves
// here too, one per capability (.claude/rules/architecture.md), instead of
// every route living in this file. First real module: auth (CR-011).
export const v1Routes: FastifyPluginAsyncZod<{ env: Env }> = async (
  app,
  opts,
) => {
  await app.register(authRoutes, { prefix: '/auth', env: opts.env });
};
