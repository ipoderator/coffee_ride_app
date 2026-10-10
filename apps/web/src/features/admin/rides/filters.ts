import { RIDE_STATUSES, adminRideVisibilityValues } from 'types';
import { readAdminEnum, readAdminSearch } from '@/lib/admin/url-filters';
import type { AdminRidesFilters } from './api';

// CR-232: `/admin/rides?q=&status=&visibility=` — parsed defensively.

export const RIDES_FILTER_DEFAULTS: AdminRidesFilters = {
  q: '',
  status: 'any',
  visibility: 'all',
};

export function parseRidesFilters(
  params: Pick<URLSearchParams, 'get'>,
): AdminRidesFilters {
  return {
    q: readAdminSearch(params),
    status: readAdminEnum(
      params.get('status'),
      [...RIDE_STATUSES, 'any'] as const,
      'any',
    ),
    visibility: readAdminEnum(
      params.get('visibility'),
      adminRideVisibilityValues,
      'all',
    ),
  };
}
