// CR-126: who besides the owner can view a rider-profile card. Kept in sync by hand
// with `packages/db/src/schema/user.ts`'s `profileVisibilityEnum` (same "each layer
// owns its own representation of one shared enum" pattern as `BicycleType`).
export const PROFILE_VISIBILITIES = [
  'closed',
  'co_participants',
  'open',
] as const;
export type ProfileVisibility = (typeof PROFILE_VISIBILITIES)[number];

// First domain type (CR-011), alongside `packages/db`'s first table. Public-safe
// shape only — no `passwordHash`, ever (`.claude/rules/security.md`). Server
// responses and `apps/web` both consume this exact shape, so there is no second,
// possibly-drifted copy of "what a user looks like over the wire".
export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  createdAt: string;
  // Profile fields (CR-013). Required-but-nullable, not optional: the server
  // always includes these keys (`null` when unset) in every response that
  // returns a `User` (`toPublicUser`) — the type says so. A handful of
  // pre-existing test fixtures that construct a `User` literal needed a
  // one-line update for this; that's a smaller, more honest cost than a type
  // that lies about a field the wire format always sends.
  displayName: string | null;
  // CR-125: shown in ride riders/participants/waitlist lists in preference to
  // `displayName` when either is set — see `apps/api/src/modules/registrations/
  // registrations.service.ts`'s `resolveParticipantName`.
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  bio: string | null;
  // CR-097 (KI-023 remainder): computed from `avatarKey`, same "API-proxy path,
  // never a direct S3 URL" precedent as `Ride.coverImageUrl` (ADR-019) — always
  // `/v1/users/me/avatar` since this type is only ever the caller's own profile,
  // never someone else's. CR-126 adds a *separate* `RiderProfile` type
  // (`api/rider-profile.ts`) for viewing another participant's card, scoped through
  // a shared ride/registration rather than a bare `GET /v1/users/:id` — this `User`
  // type still never represents anyone but the caller.
  avatarUrl: string | null;
  // CR-126: participant-controlled — see `ProfileVisibility` above.
  profileVisibility: ProfileVisibility;
  // CR-126: self-reported, manually entered (not derived from ride history). `null`
  // when unset — renders `—` per `docs/design.md` §7, never `0`.
  distanceWeekKm: number | null;
  distanceMonthKm: number | null;
  distanceYearKm: number | null;
}
