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

// CR-028 ("Route rendering"): one ordered track point, as stored in `Route.geometry`
// (`packages/db/src/schema/route.ts`) and returned by `GET /v1/rides/:id/route/
// geometry` — deliberately not part of `RouteSummary` (KI-035: the point array can be
// thousands of entries for a real GPX, so it's a separate, opt-in fetch only the
// rendering screen makes).
export interface RouteGeometryPoint {
  lat: number;
  lng: number;
  elevationMeters: number | null;
}
