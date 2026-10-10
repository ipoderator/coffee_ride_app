import { adminRideVisibilityValues } from 'types';
import { readAdminEnum } from '@/lib/admin/url-filters';
import type { AdminVisibility } from '@/lib/admin/visibility';

// CR-232: `/admin/reviews?visibility=` — parsed defensively.

export type AdminReviewsFilters = { visibility: AdminVisibility };

export const REVIEWS_FILTER_DEFAULTS: AdminReviewsFilters = {
  visibility: 'all',
};

export function parseReviewsFilters(
  params: Pick<URLSearchParams, 'get'>,
): AdminReviewsFilters {
  return {
    visibility: readAdminEnum(
      params.get('visibility'),
      adminRideVisibilityValues,
      'all',
    ),
  };
}
