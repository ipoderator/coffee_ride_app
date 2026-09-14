import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { Env } from '../env.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { usersRoutes } from '../modules/users/users.routes.js';
import { registerCsrf } from '../plugins/csrf.js';

// Versioned root (ADR-011): every product endpoint lives under /v1. Future
// feature modules (rides, routes, registrations, ...) register themselves
// here too, one per capability (.claude/rules/architecture.md), instead of
// every route living in this file. First real modules: auth (CR-011), users
// (CR-013).
export const v1Routes: FastifyPluginAsyncZod<{ env: Env }> = async (
  app,
  opts,
) => {
  // CR-012, ADR-013 §2: the Origin/Referer CSRF check applies to every
  // unsafe method under /v1 — registered as this plugin's own preHandler
  // hook (not globally on `app`) so it scopes to exactly this prefix and
  // everything nested under it; `/health` is outside this plugin and stays
  // unaffected. Applies to `PATCH /v1/users/me` too, verified in
  // `users.routes.test.ts` rather than assumed.
  registerCsrf(app, opts.env);

  await app.register(authRoutes, { prefix: '/auth', env: opts.env });
  await app.register(usersRoutes, { prefix: '/users' });
};
