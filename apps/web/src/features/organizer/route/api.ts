import type {
  CreateRoutePointRequest,
  CreateStopRequest,
  ProblemDetails,
  RoutePoint,
  RouteSummary,
  Stop,
  UpdateRoutePointRequest,
  UpdateStopRequest,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { RoutePoint, RouteSummary, Stop };

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * CR-027 ("GPX upload"): this feature module doesn't have its own `GET .../route`
 * endpoint — the route summary is an additive field on `GET /v1/rides/:id`'s
 * response (`.claude/context/current-task.md`'s scoping note). `status` (the
 * draft-only gate) and `route` are read here; CR-029 ("Route metadata") also reads
 * the ride's own `distanceKm`/`elevationGainMeters` — already present on the same
 * response — to detect a mismatch against `route`'s GPX-computed figures. CR-030
 * ("Stops") also reads the additive `stops` array, same embedding precedent. CR-031
 * ("Route points") also reads the additive `routePoints` array, same precedent again.
 */
export async function getRideRouteState(rideId: string): Promise<{
  status: string;
  distanceKm: number | null;
  elevationGainMeters: number | null;
  route: RouteSummary | null;
  stops: Stop[];
  routePoints: RoutePoint[];
}> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}`);
  const body = (await response.json()) as
    | {
        ride: {
          status: string;
          distanceKm: number | null;
          elevationGainMeters: number | null;
        };
        route: RouteSummary | null;
        stops: Stop[];
        routePoints: RoutePoint[];
      }
    | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  const parsed = body as {
    ride: {
      status: string;
      distanceKm: number | null;
      elevationGainMeters: number | null;
    };
    route: RouteSummary | null;
    stops: Stop[];
    routePoints: RoutePoint[];
  };
  return {
    status: parsed.ride.status,
    distanceKm: parsed.ride.distanceKm,
    elevationGainMeters: parsed.ride.elevationGainMeters,
    route: parsed.route,
    stops: parsed.stops,
    routePoints: parsed.routePoints,
  };
}

/** 409 `ride_not_editable` unless the ride is still `draft`. Appended at the end —
 * `position` is server-assigned, never sent by the client (`.claude/context/
 * current-task.md`). */
export async function createStop(
  rideId: string,
  input: CreateStopRequest,
): Promise<Stop> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/stops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { stop: Stop } | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as { stop: Stop }).stop;
}

/** 404 `stop_not_found` if the id doesn't exist or belongs to a different ride. */
export async function updateStop(
  rideId: string,
  stopId: string,
  patch: UpdateStopRequest,
): Promise<Stop> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/stops/${stopId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const body = (await response.json()) as { stop: Stop } | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as { stop: Stop }).stop;
}

export async function deleteStop(
  rideId: string,
  stopId: string,
): Promise<void> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/stops/${stopId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}

/** 409 `ride_not_editable` unless the ride is still `draft`. */
export async function createRoutePoint(
  rideId: string,
  input: CreateRoutePointRequest,
): Promise<RoutePoint> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/route-points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as
    { routePoint: RoutePoint } | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as { routePoint: RoutePoint }).routePoint;
}

/** 404 `route_point_not_found` if the id doesn't exist or belongs to a different ride. */
export async function updateRoutePoint(
  rideId: string,
  routePointId: string,
  patch: UpdateRoutePointRequest,
): Promise<RoutePoint> {
  const response = await fetch(
    `${RIDES_ENDPOINT}/${rideId}/route-points/${routePointId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    },
  );
  const body = (await response.json()) as
    { routePoint: RoutePoint } | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as { routePoint: RoutePoint }).routePoint;
}

export async function deleteRoutePoint(
  rideId: string,
  routePointId: string,
): Promise<void> {
  const response = await fetch(
    `${RIDES_ENDPOINT}/${rideId}/route-points/${routePointId}`,
    { method: 'DELETE' },
  );
  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}

/**
 * CR-029 ("Route metadata"): lets the organizer adopt the uploaded track's
 * distance/elevation onto the ride itself when the two have diverged — reuses
 * `PATCH /v1/rides/:id` (CR-018) directly rather than a new endpoint; own fetch call
 * rather than importing `features/organizer/rides/`'s client
 * (`.claude/rules/extensibility.md`: feature modules don't reach into each other).
 */
export async function syncRideMetricsFromRoute(
  rideId: string,
  metrics: { distanceKm: number; elevationGainMeters: number },
): Promise<void> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metrics),
  });

  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}

async function uploadOrReplace(
  method: 'POST' | 'PATCH',
  rideId: string,
  file: File,
): Promise<RouteSummary> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/route`, {
    method,
    body: formData,
  });

  const body = (await response.json()) as
    { route: RouteSummary } | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return (body as { route: RouteSummary }).route;
}

/** 409 `route_already_exists` if the ride already has one — use {@link replaceRoute}. */
export function uploadRoute(rideId: string, file: File): Promise<RouteSummary> {
  return uploadOrReplace('POST', rideId, file);
}

/** 404 `route_not_found` if none exists yet — use {@link uploadRoute}. */
export function replaceRoute(
  rideId: string,
  file: File,
): Promise<RouteSummary> {
  return uploadOrReplace('PATCH', rideId, file);
}

export async function deleteRoute(rideId: string): Promise<void> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/route`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const body = (await response.json()) as ProblemDetails;
    throw new ApiError(body);
  }
}

/** `<a>` target for the download link — a plain navigation, not a `fetch` call, so
 * the browser's own `Content-Disposition: attachment` handling drives the save. */
export function routeDownloadUrl(rideId: string): string {
  return `${RIDES_ENDPOINT}/${rideId}/route/download`;
}
