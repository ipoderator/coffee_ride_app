import type { ProblemDetails, RouteSummary } from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { RouteSummary };

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * CR-027 ("GPX upload"): this feature module doesn't have its own `GET .../route`
 * endpoint — the route summary is an additive field on `GET /v1/rides/:id`'s
 * response (`.claude/context/current-task.md`'s scoping note). `status` (the
 * draft-only gate) and `route` are read here; CR-029 ("Route metadata") also reads
 * the ride's own `distanceKm`/`elevationGainMeters` — already present on the same
 * response — to detect a mismatch against `route`'s GPX-computed figures.
 */
export async function getRideRouteState(rideId: string): Promise<{
  status: string;
  distanceKm: number | null;
  elevationGainMeters: number | null;
  route: RouteSummary | null;
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
  };
  return {
    status: parsed.ride.status,
    distanceKm: parsed.ride.distanceKm,
    elevationGainMeters: parsed.ride.elevationGainMeters,
    route: parsed.route,
  };
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
