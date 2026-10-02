import { RIDE_WIZARD_TERMS } from 'ui';
import { RideWizardFrame } from '@/features/organizer/rides/components/RideWizardFrame';
import { isWizardMode } from '@/features/organizer/rides/wizard-steps';
import { EditRideForm } from '@/features/organizer/rides/components/EditRideForm';
import { RideWorkspace } from '@/features/organizer/rides/components/RideWorkspace';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_RIDE_SECTIONS } from '@/lib/cabinet/organizer-ride-sections';

// `/organizer/rides/[id]/edit` — the ride workspace's «Обзор» tab (CR-187,
// `docs/design.md` §8): the draft form, or the published ride's overview.
// Inherits `CabinetShell`'s auth gate from `app/organizer/layout.tsx`; every
// mutation is authorized server-side by `PATCH /v1/rides/:id` and the
// lifecycle-action endpoints, not here — identity never comes from this page.
// `RideWorkspace` checks the response's `isOwner` (KI-069) and renders the
// page's `h1` (the ride's title) and the lifecycle steps.
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
  const wizardMode = isWizardMode(wizard);
  const content = (
    <RideWorkspace
      rideId={id}
      current="edit"
      sections={filterEnabled(ORGANIZER_RIDE_SECTIONS)}
      variant={wizardMode ? 'wizard' : 'full'}
    >
      <EditRideForm />
    </RideWorkspace>
  );
  // CR-156: opened from the new-ride wizard → the same screen inside its
  // step frame, with back/next links.
  if (!wizardMode) return content;
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
