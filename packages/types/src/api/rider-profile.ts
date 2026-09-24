import type { Bike } from '../domain/bike.js';

// CR-126: `GET /v1/rides/:id/riders/:registrationId/profile` — a participant's
// card, reached only through a ride/registration the viewer shares with them
// (`resolveRiderAccess`, `apps/api/src/modules/registrations/
// registrations.service.ts`), never a bare `GET /v1/users/:id`
// (`.claude/context/project-state.md`'s standing constraint). Never includes
// `phone`/`email` — those stay owner-only regardless of `profileVisibility`
// (`.claude/rules/security.md`).
export interface RiderProfileRecentRide {
  id: string;
  title: string;
  startsAt: string;
}

export interface RiderProfile {
  registrationId: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  bikes: Bike[];
  distanceWeekKm: number | null;
  distanceMonthKm: number | null;
  distanceYearKm: number | null;
  // Up to 5, most recent first — other rides with an active registration for this
  // user, restricted to rides whose own `participantsVisible` is true (reuses that
  // existing flag as the one visibility rule for "did this person ride this",
  // rather than inventing a second one).
  recentRides: RiderProfileRecentRide[];
}

export interface GetRiderProfileResponse {
  profile: RiderProfile;
}
