import { BACK_LINK_TERMS, RIDE_EDIT_TERMS, RIDE_WIZARD_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { RideWizardFrame } from '@/features/organizer/rides/components/RideWizardFrame';
import { isWizardMode } from '@/features/organizer/rides/wizard-steps';
import { EditRideForm } from '@/features/organizer/rides/components/EditRideForm';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_RIDE_SECTIONS } from '@/lib/cabinet/organizer-ride-sections';

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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ wizard?: string | string[] }>;
}) {
  const { id } = await params;
  const { wizard } = await searchParams;
  const content = (
    <div className="flex flex-col gap-6">
      <BackLink
        href="/organizer/rides"
        label={BACK_LINK_TERMS.toOrganizerRides}
      />
      <h1 className="text-h1 text-text">{RIDE_EDIT_TERMS.pageTitle}</h1>
      <EditRideForm
        rideId={id}
        sections={filterEnabled(ORGANIZER_RIDE_SECTIONS)}
      />
    </div>
  );
  // CR-156: opened from the new-ride wizard → the same screen inside its
  // step frame, with back/next links.
  if (!isWizardMode(wizard)) return content;
  return (
    <RideWizardFrame
      current="publish"
      rideId={id}
      back={{ step: 'groups', label: RIDE_WIZARD_TERMS.back }}
    >
      {content}
    </RideWizardFrame>
  );
}
