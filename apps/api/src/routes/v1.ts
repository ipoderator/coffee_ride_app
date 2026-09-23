import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import type { Env } from '../env.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { usersRoutes } from '../modules/users/users.routes.js';
import { organizersRoutes } from '../modules/organizers/organizers.routes.js';
import { ridesRoutes } from '../modules/rides/rides.routes.js';
import { rideGroupsRoutes } from '../modules/rides/ride-groups.routes.js';
import {
  myRegistrationsRoutes,
  registrationsRoutes,
} from '../modules/registrations/registrations.routes.js';
import {
  myNotificationsRoutes,
  rideUpdatesRoutes,
} from '../modules/notifications/notifications.routes.js';
import { reviewsRoutes } from '../modules/reviews/reviews.routes.js';
import { registerCsrf } from '../plugins/csrf.js';

// Versioned root (ADR-011): every product endpoint lives under /v1. Future
// feature modules register themselves here too, one per capability
// (.claude/rules/architecture.md), instead of every route living in this file.
// First real modules: auth (CR-011), users (CR-013), organizers (CR-014),
// rides (CR-017). `registrationsRoutes` (CR-032) shares rides' `/rides` prefix —
// its own capability module, but its paths (`/v1/rides/:id/register`) nest under
// the same URL space.
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
  await app.register(organizersRoutes, { prefix: '/organizers' });
  await app.register(ridesRoutes, { prefix: '/rides' });
  // CR-117 ("Pace groups"): same `rides` capability module, own plugin file.
  await app.register(rideGroupsRoutes, { prefix: '/rides' });
  await app.register(registrationsRoutes, { prefix: '/rides' });
  // CR-091 ("My registrations"): a second plugin from the same `registrations`
  // capability module, mounted at its own prefix — see `myRegistrationsRoutes`'s own
  // doc comment for why it can't nest under `/rides`.
  await app.register(myRegistrationsRoutes, { prefix: '/registrations' });
  // CR-039 ("Ride updates"): a third plugin sharing the `/rides` prefix, own
  // `notifications` capability module (`.claude/context/current-task.md`).
  await app.register(rideUpdatesRoutes, { prefix: '/rides' });
  // CR-041 ("In-app notifications"): same capability module, own prefix — no
  // single-ride parent, same reasoning as `myRegistrationsRoutes`.
  await app.register(myNotificationsRoutes, { prefix: '/notifications' });
  // CR-042 ("Review"): its own `reviews` capability module
  // (`.claude/rules/architecture.md`), sharing the `/rides` prefix like
  // `registrationsRoutes`/`rideUpdatesRoutes` above.
  await app.register(reviewsRoutes, { prefix: '/rides' });
};
