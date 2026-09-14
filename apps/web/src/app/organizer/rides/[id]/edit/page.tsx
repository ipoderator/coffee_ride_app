import { RIDE_EDIT_TERMS } from 'ui';
import { EditRideForm } from '@/features/organizer/rides/components/EditRideForm';

// `/organizer/rides/[id]/edit` (`docs/design.md` §8 "Edit draft", CR-018). Inherits
// `CabinetShell`'s auth gate from `app/organizer/layout.tsx`; ownership (CR-016) is
// enforced server-side by `GET`/`PATCH /v1/rides/:id`, not here — `EditRideForm`
// renders a not-found state for a ride id that doesn't exist or isn't the caller's.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function EditRidePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {RIDE_EDIT_TERMS.pageTitle}
      </h1>
      <EditRideForm rideId={id} />
    </div>
  );
}
