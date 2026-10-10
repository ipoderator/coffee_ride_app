/**
 * CR-230 (ADR-032): whether a ride is visible to anyone but its own organizer — it
 * has left `draft` and no admin has hidden it. The one rule every non-owner read
 * path (detail, route, cover, riders, registration, waitlist) applies, so a hidden
 * ride behaves exactly like a draft for them; discovery applies the same two
 * conditions in SQL.
 */
export function isRidePublic(ride: {
  status: string;
  hiddenAt: Date | null;
}): boolean {
  return ride.status !== 'draft' && ride.hiddenAt === null;
}
