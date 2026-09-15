// Seventh fixed domain type (CR-031, `.claude/CLAUDE.md`).
//
// "RoutePoint — start/finish/stop/danger/water/food/technical/other: a small set of
// organizer-placed *typed* markers along the route" (`docs/database.md`). Distinct
// from `Route.geometry` (the raw GPX-derived polyline) and from `Stop` (named planned
// stops with duration, shown in route order). `ROUTE_POINT_TYPES` lives here rather
// than in `packages/ui/src/terminology.ts` for the same reason `BICYCLE_TYPES` moved
// out of it (`domain/ride.ts`'s own comment): `apps/api` needs it for Zod validation
// and `packages/db` needs the same value list for its Postgres enum, and neither may
// depend on `packages/ui`.
export const ROUTE_POINT_TYPES = [
  'start',
  'finish',
  'stop',
  'danger',
  'water',
  'food',
  'technical',
  'other',
] as const;
export type RoutePointType = (typeof ROUTE_POINT_TYPES)[number];

/**
 * No `position` field, unlike `Stop` — a route point is a typed pin meant to render on
 * a map by `type`, not an itinerary read in sequence
 * (`.claude/context/current-task.md`). `label` is optional: distinct markers of the
 * same `type` (e.g. two `water` points) need a way to tell them apart that `type`
 * alone can't provide.
 */
export interface RoutePoint {
  id: string;
  rideId: string;
  type: RoutePointType;
  label: string | null;
  description: string | null;
  lat: number;
  lng: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}
