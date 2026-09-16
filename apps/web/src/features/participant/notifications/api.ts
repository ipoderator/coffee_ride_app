import type {
  ListMyNotificationsResponse,
  MarkNotificationReadResponse,
  ProblemDetails,
} from 'types';
import { ApiError } from '@/lib/api/errors';

export { ApiError };
export type { Notification } from 'types';

const NOTIFICATIONS_ENDPOINT = '/api/v1/notifications';

/**
 * CR-041 ("In-app notifications"). `GET /v1/notifications/mine` — requires a
 * session cookie (sent automatically, same origin, ADR-013). Always fetches one
 * page — same "no load more yet" precedent every other list screen in this repo
 * already established.
 */
export async function listMyNotifications(): Promise<ListMyNotificationsResponse> {
  const response = await fetch(`${NOTIFICATIONS_ENDPOINT}/mine`);
  const body = (await response.json()) as
    ListMyNotificationsResponse | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return body as ListMyNotificationsResponse;
}

/** CR-041: marks one of the caller's own notifications as read. Idempotent. */
export async function markNotificationRead(
  id: string,
): Promise<MarkNotificationReadResponse> {
  const response = await fetch(`${NOTIFICATIONS_ENDPOINT}/${id}/read`, {
    method: 'POST',
  });
  const body = (await response.json()) as
    MarkNotificationReadResponse | ProblemDetails;
  if (!response.ok) {
    throw new ApiError(body as ProblemDetails);
  }
  return body as MarkNotificationReadResponse;
}
