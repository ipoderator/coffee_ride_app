import type {
  AdminRideListItem,
  AdminRideResponse,
  ListAdminRidesResponse,
  RideStatus,
} from 'types';
import { adminRequest, toQueryString } from '@/lib/admin/client';
import type { AdminVisibility } from '@/lib/admin/visibility';

// A type alias, not an interface: `useAdminUrlFilters` needs it to be
// assignable to a string record.
export type AdminRidesFilters = {
  q: string;
  status: RideStatus | 'any';
  visibility: AdminVisibility;
};

export function listAdminRides(
  { q, status, visibility }: AdminRidesFilters,
  cursor?: string,
): Promise<ListAdminRidesResponse> {
  return adminRequest(
    `/rides${toQueryString({
      q,
      status: status === 'any' ? undefined : status,
      visibility: visibility === 'all' ? undefined : visibility,
      cursor,
    })}`,
  );
}

async function rideOf(
  request: Promise<AdminRideResponse>,
): Promise<AdminRideListItem> {
  return (await request).ride;
}

export function hideAdminRide(
  id: string,
  reason: string,
): Promise<AdminRideListItem> {
  return rideOf(
    adminRequest(`/rides/${encodeURIComponent(id)}/hide`, {
      method: 'POST',
      body: { reason },
    }),
  );
}

export function unhideAdminRide(id: string): Promise<AdminRideListItem> {
  return rideOf(
    adminRequest(`/rides/${encodeURIComponent(id)}/unhide`, { method: 'POST' }),
  );
}

/** `409 ride_not_cancellable` once the ride is a draft, started, over or
 * already cancelled. */
export function cancelAdminRide(
  id: string,
  reason: string,
): Promise<AdminRideListItem> {
  return rideOf(
    adminRequest(`/rides/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      body: { reason },
    }),
  );
}
