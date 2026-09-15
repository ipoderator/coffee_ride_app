// Fifth fixed domain type (CR-027, `.claude/CLAUDE.md`).
//
// "Route — route geometry and metadata" (`docs/database.md`). One row per `Ride`,
// created from an uploaded GPX file. `distanceKm`/`elevationGainMeters` here are
// computed from the actual GPX track — independent from `Ride.distanceKm`/
// `elevationGainMeters` (CR-018's organizer-entered manual fields); the two are not
// reconciled yet (`.claude/context/known-issues.md`).
export interface RouteSummary {
  id: string;
  rideId: string;
  gpxFileName: string;
  gpxFileSizeBytes: number;
  distanceKm: number;
  elevationGainMeters: number;
  pointCount: number;
  createdAt: string;
  updatedAt: string;
}
