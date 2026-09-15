import { z } from 'zod';
import { WAITLIST_ENTRY_STATUSES } from 'types';

// CR-036 ("Waitlist"): the one "waitlist entry over the wire" shape — returned by
// `POST .../waitlist` and embedded as `GetRideResponse.viewerWaitlistEntry`
// (`apps/api/src/modules/rides/ride-response.schema.ts`).
export const waitlistEntryResponseSchema = z.object({
  id: z.string(),
  rideId: z.string(),
  userId: z.string(),
  status: z.enum(WAITLIST_ENTRY_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
  cancelledAt: z.string().nullable(),
  promotedAt: z.string().nullable(),
});
