import { z } from 'zod';
import { NOTIFICATION_TYPES } from 'types';

// CR-039 ("Ride updates"): the one "ride update over the wire" shape.
export const rideUpdateResponseSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  message: z.string(),
  createdAt: z.string(),
});

// CR-041 ("In-app notifications"): the one "notification over the wire" shape,
// returned by both `GET /v1/notifications/mine` and
// `POST /v1/notifications/:id/read`.
export const notificationResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  ride: z.object({ id: z.string(), title: z.string() }),
  message: z.string().nullable(),
  createdAt: z.string(),
  readAt: z.string().nullable(),
});
