import { z } from 'zod';

// The one "organizer profile over the wire" shape (CLAUDE.md: no duplicate concepts).
// All three `organizers.routes.ts` handlers (create/get/update) build their response
// from this — same reasoning as `modules/users/user-response.schema.ts`. Fastify's Zod
// serializer strips anything not listed here.
export const organizerProfileResponseSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
