import type {
  BicycleType,
  DifficultyLevel,
  GetRouteGeometryResponse,
  ListPublicRidesResponse,
  ProblemDetails,
  RideListPhase,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { ListPublicRidesResponse };

const RIDES_ENDPOINT = '/api/v1/rides';

/**
 * CR-024 ("Ride list", public discovery), extended by CR-025 ("Filters") and
 * CR-153 (the filter chips: start window, pace, difficulty, free): `GET
 * /v1/rides`, no session cookie ever required or sent (`docs/api.md`: "no
 * auth"). One page per call; `cursor` fetches the next one («Показать ещё»).
 * An omitted param doesn't filter.
 */
export interface ListPublicRidesParams {
  limit?: number;
  cursor?: string;
  bicycleType?: BicycleType;
  startsFrom?: string;
  startsTo?: string;
  paceMin?: number;
  paceMax?: number;
  difficulty?: DifficultyLevel;
  free?: boolean;
  /** CR-193: `active` or `archive` (finished/cancelled); omitted — both. */
  phase?: RideListPhase;
}

export async function listPublicRides(
  params: ListPublicRidesParams = {},
): Promise<ListPublicRidesResponse> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) query.set(key, String(value));
  }
  const queryString = query.toString();

  const response = await fetch(
    `${RIDES_ENDPOINT}${queryString ? `?${queryString}` : ''}`,
  );

  const body = (await response.json()) as
    ListPublicRidesResponse | ProblemDetails;

  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }

  return body as ListPublicRidesResponse;
}

/**
 * `GET /v1/rides/:id/route/geometry` (CR-028) — the full stored line, for the
 * discovery map's selected ride. The list's `routePreview` (≤ 40 points) is a
 * simplification meant for the 32px row glyph; drawn at map scale it reads as
 * straight sticks cutting across the road network.
 */
export async function getRouteGeometry(
  rideId: string,
): Promise<GetRouteGeometryResponse> {
  const response = await fetch(`${RIDES_ENDPOINT}/${rideId}/route/geometry`);
  const body = (await response.json()) as
    GetRouteGeometryResponse | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return body as GetRouteGeometryResponse;
}
