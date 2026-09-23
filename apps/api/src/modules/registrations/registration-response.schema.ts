import { z } from 'zod';
import { REGISTRATION_STATUSES } from 'types';

// CR-032 ("Register"): the one "registration over the wire" shape — returned by
// `POST .../register` and embedded as `GetRideResponse.viewerRegistration`
// (`apps/api/src/modules/rides/ride-response.schema.ts`).
export const registrationResponseSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  userId: z.string(),
  status: z.enum(REGISTRATION_STATUSES),
  // CR-117 ("Pace groups"): additive.
  groupId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  cancelledAt: z.string().nullable(),
});
