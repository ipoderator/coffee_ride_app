import { BACK_LINK_TERMS, RIDE_ROUTE_TERMS, RIDE_WIZARD_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { RideWizardFrame } from '@/features/organizer/rides/components/RideWizardFrame';
import { isWizardMode } from '@/features/organizer/rides/wizard-steps';
import { RouteUploadForm } from '@/features/organizer/route/components/RouteUploadForm';

// `/organizer/rides/[id]/route` (`docs/design.md` §8 "Route, GPX upload, stops,
// route points" — CR-027 ships the GPX upload slice). Inherits `CabinetShell`'s auth
// gate from `app/organizer/layout.tsx`; ownership is enforced server-side by
// `GET`/`POST`/`PATCH`/`DELETE /v1/rides/:id/route`, not here.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideRoutePage({
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
      <h1 className="text-h1 text-text">{RIDE_ROUTE_TERMS.pageTitle}</h1>
      <RouteUploadForm rideId={id} />
    </div>
  );
  // CR-156: opened from the new-ride wizard → the same screen inside its
  // step frame, with back/next links.
  if (!isWizardMode(wizard)) return content;
  return (
    <RideWizardFrame
      current="route"
      rideId={id}
      back={{ step: 'basics', label: RIDE_WIZARD_TERMS.back }}
      next={{ step: 'groups', label: RIDE_WIZARD_TERMS.nextGroups }}
    >
      {content}
    </RideWizardFrame>
  );
}
