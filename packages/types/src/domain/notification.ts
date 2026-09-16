// Eleventh fixed domain type (CR-038/039/040/041, `.claude/CLAUDE.md`).
//
// "Notification — delivery record" (`docs/database.md`). `type` maps 1:1 to the
// three producer tickets (`.claude/context/current-task.md`'s scope decision):
// `registration_confirmed` (CR-038, also reused for a waitlist promotion),
// `ride_update` (CR-039), `ride_cancelled` (CR-040 — the organizer cancels the
// whole ride, not a participant cancelling their own registration).
export const NOTIFICATION_TYPES = [
  'registration_confirmed',
  'ride_update',
  'ride_cancelled',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * A single in-app notification for one user (ADR-007: in-app only for now, no
 * email/push). `ride` is the minimal `{ id, title }` a notification card needs to
 * link out and label itself — joined at read time, not denormalized (safe because
 * every producer only fires on a non-`draft` ride, and `Ride.title` is immutable
 * past `draft`). `message` is the `RideUpdate.message` text, present only when
 * `type === 'ride_update'`; `null` otherwise. `readAt` is `null` until
 * `POST /v1/notifications/:id/read` sets it — no bulk "mark all read" in this
 * ticket.
 */
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  ride: { id: string; title: string };
  message: string | null;
  createdAt: string;
  readAt: string | null;
}
