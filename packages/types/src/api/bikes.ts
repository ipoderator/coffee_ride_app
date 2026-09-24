import { z } from 'zod';
import { BIKE_TYPES, type Bike } from '../domain/bike.js';
import type { Paginated } from './pagination.js';

const brandOrModelSchema = z
  .string()
  .trim()
  .min(1, 'Cannot be empty.')
  .max(60, 'Must be at most 60 characters.')
  .nullable();

export const createBikeRequestSchema = z.object({
  bikeType: z.enum(BIKE_TYPES),
  brand: brandOrModelSchema.optional(),
  model: brandOrModelSchema.optional(),
  // Defaults `false` server-side when omitted — a newly added bike doesn't
  // silently displace whichever bike is already active.
  isActive: z.boolean().optional(),
});
export type CreateBikeRequest = z.infer<typeof createBikeRequestSchema>;

// PATCH semantics, same "absent ⇒ unchanged, explicit null ⇒ clears it" rule as
// `updateProfileRequestSchema` for brand/model — `bikeType`/`isActive` aren't
// nullable (the column itself isn't).
export const updateBikeRequestSchema = z.object({
  bikeType: z.enum(BIKE_TYPES).optional(),
  brand: brandOrModelSchema.optional(),
  model: brandOrModelSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateBikeRequest = z.infer<typeof updateBikeRequestSchema>;

export interface BikeResponse {
  bike: Bike;
}
export type ListBikesResponse = Paginated<Bike>;
