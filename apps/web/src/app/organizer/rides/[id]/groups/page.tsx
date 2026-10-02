import { RIDE_WIZARD_TERMS } from 'ui';
import { RideWizardFrame } from '@/features/organizer/rides/components/RideWizardFrame';
import { RideWorkspace } from '@/features/organizer/rides/components/RideWorkspace';
import { isWizardMode } from '@/features/organizer/rides/wizard-steps';
import { GroupsEditor } from '@/features/organizer/groups/components/GroupsEditor';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_RIDE_SECTIONS } from '@/lib/cabinet/organizer-ride-sections';

// `/organizer/rides/[id]/groups` (CR-120, ADR-022 pace groups; the ride
// workspace's «Группы» tab since CR-187). Inherits `CabinetShell`'s auth gate
// from `app/organizer/layout.tsx`; ownership is enforced server-side by
// `GET`/`POST`/`PATCH`/`DELETE /v1/rides/:id/groups`, not here.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideGroupsPage({
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
      current="groups"
      sections={filterEnabled(ORGANIZER_RIDE_SECTIONS)}
      variant={wizardMode ? 'wizard' : 'full'}
    >
      <GroupsEditor rideId={id} />
    </RideWorkspace>
  );
  // CR-156: opened from the new-ride wizard → the same screen inside its
  // step frame, with back/next links.
  if (!wizardMode) return content;
  return (
    <RideWizardFrame
      current="groups"
      rideId={id}
      back={{ step: 'route', label: RIDE_WIZARD_TERMS.back }}
      next={{ step: 'publish', label: RIDE_WIZARD_TERMS.nextPublish }}
    >
      {content}
    </RideWizardFrame>
  );
}
