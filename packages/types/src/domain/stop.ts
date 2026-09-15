// Sixth fixed domain type (CR-030, `.claude/CLAUDE.md`).
//
// "Stop — named planned stop with location and duration" (`docs/database.md`).
// Distinct from `RouteSummary` (the raw GPX polyline) and the not-yet-built
// `RoutePoint` (CR-031). `position` orders stops along the route — server-assigned on
// create, never part of a client request (`.claude/context/current-task.md`).
export interface Stop {
  id: string;
  rideId: string;
  name: string;
  description: string | null;
  lat: number;
  lng: number;
  durationMinutes: number | null;
  position: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}
