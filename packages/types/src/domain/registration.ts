// Eighth fixed domain type (CR-032, `.claude/CLAUDE.md`).
//
// "Registration — User ↔ Ride" (`docs/database.md`). `status` keeps a cancelled
// registration as a row rather than deleting it (audit trail,
// `.claude/rules/security.md`) and lets a participant re-register after cancelling —
// a fresh row, not a resurrected one.
export const REGISTRATION_STATUSES = ['active', 'cancelled'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

// CR-181 ("Finish self-check-in"): the organizer's verdict on an active registration;
// `null` on `Registration.attendance` = undecided. Separate from `status` on purpose —
// a no-show stays an active, reversible row.
// CR-182: `dnf` = «сошёл» (started, did not finish); `no_show` = never came.
export const REGISTRATION_ATTENDANCES = ['finished', 'no_show', 'dnf'] as const;
export type RegistrationAttendance = (typeof REGISTRATION_ATTENDANCES)[number];

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
  // CR-181: the participant's own «I finished» claim — only a claim.
  finishClaimedAt: string | null;
  // CR-181: the organizer's decision; `null` until they make one.
  attendance: RegistrationAttendance | null;
}
