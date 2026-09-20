// Second fixed domain type (CR-014, alongside `packages/db`'s third table). Public-safe
// shape — everything here is meant to be shown publicly once a `Ride` embeds it
// (CR-017+); there is no private field on this entity the way `User.phone` is private.
export interface OrganizerProfile {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  // CR-097 (KI-023 remainder): computed from `avatarKey`, served via the public
  // `GET /v1/organizers/:id/avatar` (no auth — an organizer's identity is already
  // public via `RideOrganizerSummary`, unlike a ride's draft-gated cover),
  // same "API-proxy path, never a direct S3 URL" precedent as `Ride.
  // coverImageUrl` (ADR-019).
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}
