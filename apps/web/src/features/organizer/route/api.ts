import type { ProblemDetails, RouteSummary } from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { RouteSummary };

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * CR-027 ("GPX upload"): this feature module doesn't have its own `GET .../route`
 * endpoint — the route summary is an additive field on `GET /v1/rides/:id`'s
 * response (`.claude/context/current-task.md`'s scoping note). Only `route` and the
 * ride's own `status` (needed for the draft-only gate) are read here.
 */
export async function getRideRouteState(rideId: string): Promise<{
  status: string;
  route: RouteSummary | null;
}> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}`);
  const body = (await response.json()) as
    { ride: { status: string }; route: RouteSummary | null } | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  const parsed = body as {
    ride: { status: string };
    route: RouteSummary | null;
  };
  return { status: parsed.ride.status, route: parsed.route };
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
