import { z } from 'zod';
import { PROFILE_VISIBILITIES, type User } from '../domain/user.js';

// CR-013 (`.claude/rules/architecture.md`: `users` is its own backend feature area,
// distinct from `auth`). PATCH semantics: every field is independently omittable
// (leaves the stored value unchanged) or settable to `null` (clears it) — a field's
// *absence* from the request body and an explicit `null` are different things, which
// is why every field is `.nullable().optional()` rather than just `.optional()`.
//
// No length/format check here is a DB-level constraint (`packages/db/src/schema/
// user.ts`) — these are API-boundary validation only, same tier as
// `registerRequestSchema`'s password-length check.
export const updateProfileRequestSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, 'Display name cannot be empty.')
    .max(80, 'Display name must be at most 80 characters.')
    .nullable()
    .optional(),
  // CR-125: shown in ride riders/participants/waitlist lists in preference to
  // `displayName`.
  firstName: z
    .string()
    .trim()
    .min(1, 'First name cannot be empty.')
    .max(60, 'First name must be at most 60 characters.')
    .nullable()
    .optional(),
  lastName: z
    .string()
    .trim()
    .min(1, 'Last name cannot be empty.')
    .max(60, 'Last name must be at most 60 characters.')
    .nullable()
    .optional(),
  // Loose on purpose: full phone-number validation (country codes, real
  // formatting) is out of this ticket's scope — this just rejects obvious
  // garbage, not anything more.
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+()\-\s]{7,20}$/, 'Enter a valid phone number.')
    .nullable()
    .optional(),
  bio: z
    .string()
    .trim()
    .max(500, 'Bio must be at most 500 characters.')
    .nullable()
    .optional(),
  // CR-126. `users.profile_visibility` is `NOT NULL` (defaults `co_participants`) —
  // omittable (leaves it unchanged) but never nullable, unlike the fields above.
  profileVisibility: z.enum(PROFILE_VISIBILITIES).optional(),
  // CR-126: self-reported, bounds mirror `packages/db/src/schema/user.ts`'s CHECK
  // constraints (sanity caps, not real-world limits).
  distanceWeekKm: z.number().int().min(0).max(3000).nullable().optional(),
  distanceMonthKm: z.number().int().min(0).max(10000).nullable().optional(),
  distanceYearKm: z.number().int().min(0).max(100000).nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export interface UpdateProfileResponse {
  user: User;
}
