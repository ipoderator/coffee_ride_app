/**
 * CR-149: the organizer-cabinet screens a rider's profile card
 * (`/rides/[id]/riders/[registrationId]`, CR-126) can be opened from, so the
 * card's back link returns there instead of to the public ride page. A closed
 * set, never a free-form return URL — the query value only picks one of these.
 */
export const RIDER_PROFILE_ORIGINS = ['overview', 'participants'] as const;

export type RiderProfileOrigin = (typeof RIDER_PROFILE_ORIGINS)[number];

export function riderProfileHref(
  rideId: string,
  registrationId: string,
  from?: RiderProfileOrigin,
): string {
  const path = `/rides/${rideId}/riders/${registrationId}`;
  return from ? `${path}?from=${from}` : path;
}

export function parseRiderProfileOrigin(
  value: string | string[] | undefined,
): RiderProfileOrigin | null {
  return RIDER_PROFILE_ORIGINS.find((origin) => origin === value) ?? null;
}
