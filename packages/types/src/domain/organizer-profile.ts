// Second fixed domain type (CR-014, alongside `packages/db`'s third table). Public-safe
// shape — everything here is meant to be shown publicly once a `Ride` embeds it
// (CR-017+); there is no private field on this entity the way `User.phone` is private.
export interface OrganizerProfile {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}
