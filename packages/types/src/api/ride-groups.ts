import { z } from 'zod';
import {
  RIDE_GROUP_DESCRIPTION_MAX_LENGTH,
  RIDE_GROUP_MAX_PER_RIDE,
  RIDE_GROUP_NAME_MAX_LENGTH,
  RIDE_GROUP_PACE_MAX_KMH,
  RIDE_GROUP_PACE_MIN_KMH,
  type RideGroup,
} from '../domain/ride-group.js';
import type { Paginated } from './pagination.js';

// CR-117 ("Pace groups"). `name` is required server-side — a default like «Группа 1»
// is the client's to suggest, not the API's to invent. `position` is not part of
// create (appended at the end, same as `createStopRequestSchema`).
const groupNameSchema = z
  .string()
  .trim()
  .min(1, 'Name cannot be empty.')
  .max(
    RIDE_GROUP_NAME_MAX_LENGTH,
    `Name must be at most ${RIDE_GROUP_NAME_MAX_LENGTH} characters.`,
  );
const groupPaceSchema = z
  .number()
  .min(
    RIDE_GROUP_PACE_MIN_KMH,
    `paceKmh must be between ${RIDE_GROUP_PACE_MIN_KMH} and ${RIDE_GROUP_PACE_MAX_KMH}.`,
  )
  .max(
    RIDE_GROUP_PACE_MAX_KMH,
    `paceKmh must be between ${RIDE_GROUP_PACE_MIN_KMH} and ${RIDE_GROUP_PACE_MAX_KMH}.`,
  );
const groupDescriptionSchema = z
  .string()
  .trim()
  .max(
    RIDE_GROUP_DESCRIPTION_MAX_LENGTH,
    `Description must be at most ${RIDE_GROUP_DESCRIPTION_MAX_LENGTH} characters.`,
  )
  .nullable();

export const createRideGroupRequestSchema = z.object({
  name: groupNameSchema,
  paceKmh: groupPaceSchema,
  description: groupDescriptionSchema.optional(),
});
export type CreateRideGroupRequest = z.infer<
  typeof createRideGroupRequestSchema
>;

// Every field independently optional (same PATCH semantics as
// `updateStopRequestSchema`). `position` moves the group to that slot and shifts
// the others; a value past the last slot is clamped to the end.
export const updateRideGroupRequestSchema = z.object({
  name: groupNameSchema.optional(),
  paceKmh: groupPaceSchema.optional(),
  description: groupDescriptionSchema.optional(),
  position: z
    .number()
    .int()
    .min(0, 'position must not be negative.')
    .max(
      RIDE_GROUP_MAX_PER_RIDE - 1,
      `position must be at most ${RIDE_GROUP_MAX_PER_RIDE - 1}.`,
    )
    .optional(),
});
export type UpdateRideGroupRequest = z.infer<
  typeof updateRideGroupRequestSchema
>;

export interface CreateRideGroupResponse {
  group: RideGroup;
}

export interface UpdateRideGroupResponse {
  group: RideGroup;
}

// `GET /v1/rides/:id/groups` (organizer-only): the full row plus its live count of
// active registrations — what the groups editor needs to warn before a delete.
export type RideGroupWithCount = RideGroup & { registrationsCount: number };
export type ListRideGroupsResponse = Paginated<RideGroupWithCount>;

// `GET /v1/rides/:id`'s public `groups[]` — no audit fields (`updatedBy`/timestamps),
// just what a participant needs to choose a group.
export interface RideGroupSummary {
  id: string;
  name: string;
  paceKmh: number;
  description: string | null;
  position: number;
  registrationsCount: number;
}

// The minimal group reference embedded in participant lists.
export interface RideGroupRef {
  id: string;
  name: string;
  paceKmh: number;
}

// `GET /v1/rides/:id/riders` — the signed-in-only public participant list. Display
// name + group only: no user/registration id, email, phone or emergency data
// (`.claude/rules/security.md`). `displayName` is `null` when the participant never
// set one (the client shows a neutral placeholder).
export interface RideRider {
  displayName: string | null;
  group: RideGroupRef | null;
}
export type ListRideRidersResponse = Paginated<RideRider>;
