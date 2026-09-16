import { z } from 'zod';
import type { Review } from '../domain/review.js';
import type { Paginated } from './pagination.js';

// CR-042 ("Review"). `POST /v1/rides/:id/reviews` — eligibility (active registration
// on a `finished` ride, one review per user per ride) is enforced server-side
// (`apps/api/src/modules/reviews/reviews.service.ts`), not part of this request body.
// `comment` bound at 2000 chars, same tier as `createRideUpdateRequestSchema.message`.
export const createReviewRequestSchema = z.object({
  rating: z
    .number()
    .int('rating must be a whole number.')
    .min(1, 'rating must be between 1 and 5.')
    .max(5, 'rating must be between 1 and 5.'),
  comment: z
    .string()
    .trim()
    .max(2000, 'Comment must be at most 2000 characters.')
    .nullable()
    .optional(),
});
export type CreateReviewRequest = z.infer<typeof createReviewRequestSchema>;

export interface CreateReviewResponse {
  review: Review;
}

export type ListRideReviewsResponse = Paginated<Review>;
