import { BACK_LINK_TERMS, RIDE_EDIT_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { EditRideForm } from '@/features/organizer/rides/components/EditRideForm';

// `/organizer/rides/[id]/edit` (`docs/design.md` §8 "Edit draft", CR-018). Inherits
// `CabinetShell`'s auth gate from `app/organizer/layout.tsx`; every mutation is
// authorized server-side by `PATCH /v1/rides/:id` and the lifecycle-action endpoints,
// not here — identity never comes from this page. `GET /v1/rides/:id` is also the
// public ride-detail endpoint (CR-023), so `EditRideForm` additionally checks the
// response's `isOwner` (KI-069) to show its not-found state for a ride that exists
// and isn't a draft but isn't the caller's, instead of rendering the form.
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
      <BackLink
        href="/organizer/rides"
        label={BACK_LINK_TERMS.toOrganizerRides}
      />
      <h1 className="text-2xl font-semibold text-text">
        {RIDE_EDIT_TERMS.pageTitle}
      </h1>
      <EditRideForm rideId={id} />
    </div>
  );
}
