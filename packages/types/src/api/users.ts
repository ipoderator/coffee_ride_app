import { z } from 'zod';
import type { User } from '../domain/user.js';

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
});
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;

export interface UpdateProfileResponse {
  user: User;
}
