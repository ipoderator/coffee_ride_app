import { z } from 'zod';
import type { OrganizerProfile } from '../domain/organizer-profile.js';

// CR-014 (`.claude/rules/architecture.md`: `organizers` is its own backend feature
// area). `name` is required on create (an `OrganizerProfile` cannot exist without a
// public identity) but merely optional-to-omit on update — same PATCH-semantics
// reasoning as `updateProfileRequestSchema` (CR-013): a field's *absence* leaves the
// stored value unchanged, an explicit `null` clears it (only meaningful for
// `description`, since `name` is never nullable — the DB column is `NOT NULL`).
//
// No length/format check here duplicates a DB-level constraint — these are
// API-boundary validation only, same tier as every other Zod schema in this package.
export const createOrganizerProfileRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Organizer name cannot be empty.')
    .max(100, 'Organizer name must be at most 100 characters.'),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be at most 500 characters.')
    .nullable()
    .optional(),
});
export type CreateOrganizerProfileRequest = z.infer<
  typeof createOrganizerProfileRequestSchema
>;

export const updateOrganizerProfileRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Organizer name cannot be empty.')
    .max(100, 'Organizer name must be at most 100 characters.')
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, 'Description must be at most 500 characters.')
    .nullable()
    .optional(),
});
export type UpdateOrganizerProfileRequest = z.infer<
  typeof updateOrganizerProfileRequestSchema
>;

// One response shape for all three endpoints (create/get/update) — same
// "no duplicate concepts" reasoning `modules/users` already follows.
// CR-043 ("Organizer rating summary"): additive `rating`/`reviewCount`, same
// aggregate `RideOrganizerSummary` (`./rides.js`) carries — lets `/organizer/profile`
// show the organizer their own rating without a separate endpoint. A brand-new
// profile (just created, or with no reviews yet) is `rating: null, reviewCount: 0`.
export interface OrganizerProfileResponse {
  organizerProfile: OrganizerProfile;
  rating: number | null;
  reviewCount: number;
}
export type CreateOrganizerProfileResponse = OrganizerProfileResponse;
export type GetOrganizerProfileResponse = OrganizerProfileResponse;
export type UpdateOrganizerProfileResponse = OrganizerProfileResponse;
