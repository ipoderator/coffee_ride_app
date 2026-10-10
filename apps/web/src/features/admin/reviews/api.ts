import type {
  AdminReviewListItem,
  AdminReviewResponse,
  ListAdminReviewsResponse,
} from 'types';
import { adminRequest, toQueryString } from '@/lib/admin/client';
import type { AdminVisibility } from '@/lib/admin/visibility';

export function listAdminReviews(
  visibility: AdminVisibility,
  cursor?: string,
): Promise<ListAdminReviewsResponse> {
  return adminRequest(
    `/reviews${toQueryString({
      visibility: visibility === 'all' ? undefined : visibility,
      cursor,
    })}`,
  );
}

async function reviewOf(
  request: Promise<AdminReviewResponse>,
): Promise<AdminReviewListItem> {
  return (await request).review;
}

export function hideAdminReview(
  id: string,
  reason: string,
): Promise<AdminReviewListItem> {
  return reviewOf(
    adminRequest(`/reviews/${encodeURIComponent(id)}/hide`, {
      method: 'POST',
      body: { reason },
    }),
  );
}

export function unhideAdminReview(id: string): Promise<AdminReviewListItem> {
  return reviewOf(
    adminRequest(`/reviews/${encodeURIComponent(id)}/unhide`, {
      method: 'POST',
    }),
  );
}
