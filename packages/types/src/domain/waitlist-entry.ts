// Ninth fixed domain type (CR-036, `.claude/CLAUDE.md`).
//
// "WaitlistEntry — user waiting for a place" (`docs/database.md`). `waiting` is the
// only active state; `promoted` (a real `Registration` was created for this user once
// a spot freed up) and `cancelled` (the participant left the queue) are both terminal
// — the row is kept either way, same audit-trail discipline as `Registration.status`.
export const WAITLIST_ENTRY_STATUSES = [
  'waiting',
  'promoted',
  'cancelled',
] as const;
export type WaitlistEntryStatus = (typeof WAITLIST_ENTRY_STATUSES)[number];

/**
 * A participant's place in a `Ride`'s waitlist queue (`.claude/context/current-task.md`).
 * Queue order is `createdAt` ascending — no separate `position` column (a waitlist has
 * no reordering use case, unlike `Stop.position`). `cancelledAt`/`promotedAt` are each
 * `null` while `status` is `'waiting'`, set once and never cleared.
 */
export interface WaitlistEntry {
  id: string;
  rideId: string;
  userId: string;
  status: WaitlistEntryStatus;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
  promotedAt: string | null;
}
