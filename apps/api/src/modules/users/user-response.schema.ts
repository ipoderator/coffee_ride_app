import { z } from 'zod';
import { BIKE_TYPES, PROFILE_VISIBILITIES } from 'types';

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
  // CR-125: shown in ride riders/participants/waitlist lists in preference to
  // `displayName`.
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  bio: z.string().nullable(),
  // CR-097 (KI-023 remainder): computed API-proxy path, never a stored URL —
  // same precedent as `Ride.coverImageUrl` (ADR-019).
  avatarUrl: z.string().nullable(),
  // CR-126.
  profileVisibility: z.enum(PROFILE_VISIBILITIES),
  distanceWeekKm: z.number().nullable(),
  distanceMonthKm: z.number().nullable(),
  distanceYearKm: z.number().nullable(),
});

// CR-126 ("garage"). Bikes are always created/edited through
// `createBikeRequestSchema`/`updateBikeRequestSchema` (`packages/types`), which
// reject `'any'` — this response schema only ever sees the three real values.
export const bikeResponseSchema = z.object({
  id: z.string(),
  bikeType: z.enum(BIKE_TYPES),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  isActive: z.boolean(),
});
