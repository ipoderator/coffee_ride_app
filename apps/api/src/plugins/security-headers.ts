import type { FastifyInstance } from 'fastify';
import helmet from '@fastify/helmet';

// CR-061 (`.claude/rules/security.md`'s Transport & headers section, KI-022).
// Registered globally on `app` (not scoped to `v1Routes` the way `csrf.ts`
// is) — unlike CSRF, which only matters for cookie-bearing `/v1` mutations,
// generic response headers are worth sending on every route this process
// serves, including `/health` and `/docs` (Swagger UI).
//
// Custom CSP directives, not helmet's raw defaults — two real deviations:
// - `upgradeInsecureRequests` is explicitly removed. This app never
//   terminates TLS itself (a reverse proxy does, per ADR-013/CR-075, not yet
//   built) — the default directive would make a browser rewrite `/docs`'s
//   own same-origin sub-requests to `https://` in local dev, which has no
//   listener there, breaking Swagger UI entirely over plain `http://`.
// - `frameAncestors` is tightened to `'none'` (helmet's default is `'self'`)
//   and paired with `xFrameOptions: { action: 'deny' }` — this API is never
//   meant to be framed by anything, including itself.
// `styleSrc`/`imgSrc` stay permissive enough for `/docs` (Swagger UI's own
// inline styles and embedded logo) — `'unsafe-inline'` on `styleSrc` is
// helmet's own default already, not a bar lowered for this app.
export async function registerSecurityHeaders(app: FastifyInstance) {
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
    xFrameOptions: { action: 'deny' },
  });
}
