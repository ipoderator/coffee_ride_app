import { CreateRideForm } from '@/features/organizer/rides/components/CreateRideForm';
import { RideWizardFrame } from '@/features/organizer/rides/components/RideWizardFrame';

// `/organizer/rides/new` — step 1 of the new-ride wizard (CR-156; `docs/
// design.md` §8 "Create ride", originally CR-017). `?ride=<id>` reopens a
// draft this wizard already saved. Inherits `CabinetShell`'s auth gate from
// `app/organizer/layout.tsx`; ownership is enforced server-side by
// `GET`/`PATCH /v1/rides/:id`.
//
// Next.js 15: `searchParams` is a `Promise` for a page, not a plain object.
export default async function CreateRidePage({
  searchParams,
}: {
  searchParams: Promise<{ ride?: string | string[] }>;
}) {
  const { ride } = await searchParams;
  const rideId = typeof ride === 'string' && ride ? ride : null;
  return (
    <RideWizardFrame current="basics" rideId={rideId}>
      <CreateRideForm rideId={rideId} />
    </RideWizardFrame>
  );
}
