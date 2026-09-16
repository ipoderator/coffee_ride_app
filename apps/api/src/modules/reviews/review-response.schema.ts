import { z } from 'zod';

// CR-042 ("Review"): the one "review over the wire" shape, returned by both
// `POST`/`GET /v1/rides/:id/reviews` — same "one response shape per resource"
// precedent as `notification-response.schema.ts`'s `rideUpdateResponseSchema`.
export const reviewResponseSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  userId: z.string(),
  authorName: z.string().nullable(),
  rating: z.number(),
  comment: z.string().nullable(),
  createdAt: z.string(),
});
