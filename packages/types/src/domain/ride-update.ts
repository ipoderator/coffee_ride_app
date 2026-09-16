// Tenth fixed domain type (CR-039, `.claude/CLAUDE.md`).
//
// "RideUpdate — organizer message" (`docs/database.md`). No `updatedAt`/edit
// support — a sent update is immutable (`.claude/context/current-task.md`: no doc
// names an edit/delete action).
export interface RideUpdate {
  id: string;
  rideId: string;
  message: string;
  createdAt: string;
}
