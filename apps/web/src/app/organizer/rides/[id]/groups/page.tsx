import Link from 'next/link';
import { BACK_LINK_TERMS, ORGANIZER_GROUPS_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { GroupsEditor } from '@/features/organizer/groups/components/GroupsEditor';

// `/organizer/rides/[id]/groups` (CR-120, ADR-022 pace groups). Inherits
// `CabinetShell`'s auth gate from `app/organizer/layout.tsx`; ownership is
// enforced server-side by `GET`/`POST`/`PATCH`/`DELETE /v1/rides/:id/groups`,
// not here — same pattern as `.../participants/page.tsx`.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideGroupsPage({
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
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-text">
          {ORGANIZER_GROUPS_TERMS.pageTitle}
        </h1>
        <Link
          href={`/organizer/rides/${id}/edit`}
          className="self-start text-sm font-medium text-primary hover:underline"
        >
          {ORGANIZER_GROUPS_TERMS.backToEdit}
        </Link>
      </div>
      <GroupsEditor rideId={id} />
    </div>
  );
}
