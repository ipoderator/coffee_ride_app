import { z } from 'zod';
import type { Notification } from '../domain/notification.js';
import type { RideUpdate } from '../domain/ride-update.js';
import { listRidesQuerySchema } from './rides.js';
import type { Paginated } from './pagination.js';

// CR-039 ("Ride updates"). `POST /v1/rides/:id/updates` body — organizer-composed
// free text, bounded the same way `rides.description` is (Zod-layer limit only, no
// DB CHECK for free-text length).
export const createRideUpdateRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty.')
    .max(2000, 'Message must be at most 2000 characters.'),
});
export type CreateRideUpdateRequest = z.infer<
  typeof createRideUpdateRequestSchema
>;

export interface CreateRideUpdateResponse {
  rideUpdate: RideUpdate;
}

// `GET /v1/rides/:id/updates` (organizer-only, `.claude/context/current-task.md`) —
// same `limit`/`cursor` shape as `listRidesQuerySchema`, reused directly rather than
// redefined (this endpoint has no filter dimension of its own).
export type ListRideUpdatesResponse = Paginated<RideUpdate>;

// CR-041 ("In-app notifications"). `GET /v1/notifications/mine` — same
// `limit`/`cursor` shape as `listRidesQuerySchema`, reused directly (no filter
// dimension of its own — unlike `/registrations/mine`'s required `when`, a
// notification inbox has no natural upcoming/past split).
export const listNotificationsQuerySchema = listRidesQuerySchema;
export type ListNotificationsQuery = z.infer<
  typeof listNotificationsQuerySchema
>;

export type ListMyNotificationsResponse = Paginated<Notification>;

export interface MarkNotificationReadResponse {
  notification: Notification;
}
