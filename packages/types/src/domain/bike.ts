// CR-126 ("garage"): a bike the participant lists on their profile. The DB column
// (`packages/db/src/schema/bike.ts`) reuses `ride.ts`'s `bicycleTypeEnum` wholesale
// (same physical-bike-type concept a ride's `bicycleType` uses), but `'any'`
// describes a ride's requirement, not one physical bike — this narrower type (and
// `createBikeRequestSchema`/`updateBikeRequestSchema` in `api/bikes.ts`) excludes
// it, since the app layer never lets a bike row be created with it.
export const BIKE_TYPES = ['road', 'gravel', 'mtb'] as const;
export type BikeType = (typeof BIKE_TYPES)[number];

export interface Bike {
  id: string;
  bikeType: BikeType;
  brand: string | null;
  model: string | null;
  isActive: boolean;
}
