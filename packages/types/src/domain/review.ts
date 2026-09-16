// Twelfth fixed domain type (CR-042, `.claude/CLAUDE.md`).
//
// "Review — participant feedback on a finished ride" (`docs/database.md`). No
// `updatedAt`/edit support — a submitted review is immutable
// (`.claude/context/current-task.md`, same precedent as `RideUpdate`).
// `authorName` is embedded directly (same precedent as `Notification.ride`) so a
// public review list needs no separate author lookup — only the display name, never
// contact data (`.claude/rules/security.md`).
export interface Review {
  id: string;
  rideId: string;
  userId: string;
  authorName: string | null;
  rating: number;
  comment: string | null;
  createdAt: string;
}
