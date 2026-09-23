// CR-117 ("Pace groups"), ADR-022 — added to the fixed domain entity list in
// `.claude/CLAUDE.md` by that ADR.
//
// "RideGroup — a pace group inside one ride" (`docs/database.md`): e.g. three groups
// at 25, 30 and 35 km/h. A participant registers into exactly one group when the ride
// has any (`Registration.groupId`). `position` orders groups for display, dense
// `0..n-1` per ride — server-assigned on create, movable via `PATCH`.
export interface RideGroup {
  id: string;
  rideId: string;
  name: string;
  paceKmh: number;
  description: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// Organizer-configurable bounds, shared by the API's Zod schemas and the web form.
export const RIDE_GROUP_MAX_PER_RIDE = 6;
export const RIDE_GROUP_NAME_MAX_LENGTH = 60;
export const RIDE_GROUP_DESCRIPTION_MAX_LENGTH = 500;
export const RIDE_GROUP_PACE_MIN_KMH = 5;
export const RIDE_GROUP_PACE_MAX_KMH = 60;
