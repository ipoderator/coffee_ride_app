// Eighth fixed domain type (CR-032, `.claude/CLAUDE.md`).
//
// "Registration — User ↔ Ride" (`docs/database.md`). `status` keeps a cancelled
// registration as a row rather than deleting it (audit trail,
// `.claude/rules/security.md`) and lets a participant re-register after cancelling —
// a fresh row, not a resurrected one.
export const REGISTRATION_STATUSES = ['active', 'cancelled'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/**
 * A participant's registration for a `Ride` (`.claude/context/current-task.md`).
 * `cancelledAt` is `null` while `status` is `'active'`, set once on cancellation —
 * never cleared, even if the same user registers again (that's a new row).
 */
export interface Registration {
  id: string;
  rideId: string;
  userId: string;
  status: RegistrationStatus;
  // CR-117 ("Pace groups", ADR-022): the `RideGroup` the participant rides with —
  // `null` when the ride has no groups, or for a registration made before the
  // organizer added them.
  groupId: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}
