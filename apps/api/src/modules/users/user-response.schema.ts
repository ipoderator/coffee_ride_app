import { z } from 'zod';

// The one "user over the wire" shape (CLAUDE.md: no duplicate concepts under
// different names). Every route that returns a `User` — `auth.routes.ts`'s
// register/verify-email/login/me, and this module's `PATCH /me` — builds its
// response schema from this, so there is exactly one place that decides which
// fields actually leave the process. Fastify's Zod serializer strips anything
// not listed here, which is what actually keeps `passwordHash` from ever
// escaping, on top of `auth.service.ts`'s `toPublicUser` not including it in
// the first place (`.claude/rules/security.md`: belt and suspenders).
export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  createdAt: z.string(),
  // CR-013. Nullable, not optional, in the response: the server always
  // includes these keys (`null` when unset) — `User`'s TS type marks them
  // optional only so pre-CR-013 object literals elsewhere don't need updating.
  displayName: z.string().nullable(),
  phone: z.string().nullable(),
  bio: z.string().nullable(),
});
