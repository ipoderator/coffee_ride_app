import type { FastifyPluginAsyncZod } from '@fastify/type-provider-zod';
import { z } from 'zod';
import { createReviewRequestSchema, listRidesQuerySchema } from 'types';
import { requireAuth } from '../../plugins/auth.js';
import { reviewResponseSchema } from './review-response.schema.js';
import { createReview, listRideReviews } from './reviews.service.js';

const rideIdParamsSchema = z.object({
  id: z.uuid('id must be a valid ride id.'),
});

const createReviewResponseWrapper = z.object({ review: reviewResponseSchema });
const listRideReviewsResponseSchema = z.object({
  items: z.array(reviewResponseSchema),
  nextCursor: z.string().nullable(),
});

/**
 * CR-042 ("Review"). `.claude/rules/architecture.md` names `reviews` as its own
 * capability module. Registered by `routes/v1.ts` under the `/rides` prefix, same
 * "third plugin sharing a prefix" precedent as `rideUpdatesRoutes`
 * (`/v1/rides/:id/reviews`).
 */
export const reviewsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/:id/reviews',
    {
      schema: {
        params: rideIdParamsSchema,
        body: createReviewRequestSchema,
        response: { 201: createReviewResponseWrapper },
      },
      preHandler: requireAuth,
    },
    async (request, reply) => {
      const review = await createReview(
        app.db,
        request.user!.id,
        request.params.id,
        request.body,
      );
      return reply.status(201).send({ review });
    },
  );

  // Public — no `requireAuth` — same "complete ride record" reasoning
  // `GET /v1/rides/:id`/`GET /v1/rides/:id/route/geometry` already establish.
  app.get(
    '/:id/reviews',
    {
      schema: {
        params: rideIdParamsSchema,
        querystring: listRidesQuerySchema,
        response: { 200: listRideReviewsResponseSchema },
      },
    },
    async (request, reply) => {
      const page = await listRideReviews(
        app.db,
        request.params.id,
        request.query,
      );
      return reply.status(200).send(page);
    },
  );
};
