// Tenth fixed domain type (CR-039, `.claude/CLAUDE.md`).
//
// "RideUpdate — organizer message" (`docs/database.md`). No `updatedAt`/edit
// support — a sent update is immutable (`.claude/context/current-task.md`: no doc
// names an edit/delete action).
export interface RideUpdate {
  id: string;
  rideId: string;
  /** The organizer's text; for a reschedule (CR-190), the stated reason. */
  message: string;
  createdAt: string;
  /**
   * CR-190: additive. Set when this update records a reschedule
   * (`POST /v1/rides/:id/reschedule`) — the start it replaced and the start it
   * set, both instants (ADR-012, read in the ride's `startTimezone`). `null`
   * for an ordinary message.
   */
  reschedule: RideUpdateReschedule | null;
}

/** CR-190: the two ends of a reschedule. */
export interface RideUpdateReschedule {
  previousStartsAt: string;
  startsAt: string;
}
