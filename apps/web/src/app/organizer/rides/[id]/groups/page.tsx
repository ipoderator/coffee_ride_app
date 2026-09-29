import Link from 'next/link';
import { BACK_LINK_TERMS, ORGANIZER_GROUPS_TERMS, RIDE_WIZARD_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { RideWizardFrame } from '@/features/organizer/rides/components/RideWizardFrame';
import { isWizardMode } from '@/features/organizer/rides/wizard-steps';
import { GroupsEditor } from '@/features/organizer/groups/components/GroupsEditor';

// `/organizer/rides/[id]/groups` (CR-120, ADR-022 pace groups). Inherits
// `CabinetShell`'s auth gate from `app/organizer/layout.tsx`; ownership is
// enforced server-side by `GET`/`POST`/`PATCH`/`DELETE /v1/rides/:id/groups`,
// not here — same pattern as `.../participants/page.tsx`.
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
  const content = (
    <div className="flex flex-col gap-6">
      <BackLink
        href="/organizer/rides"
        label={BACK_LINK_TERMS.toOrganizerRides}
      />
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-text">
          {ORGANIZER_GROUPS_TERMS.pageTitle}
        </h1>
        <Link
          href={`/organizer/rides/${id}/edit`}
          className="self-start inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
        >
          {ORGANIZER_GROUPS_TERMS.backToEdit}
        </Link>
      </div>
      <GroupsEditor rideId={id} />
    </div>
  );
  // CR-156: opened from the new-ride wizard → the same screen inside its
  // step frame, with back/next links.
  if (!isWizardMode(wizard)) return content;
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
