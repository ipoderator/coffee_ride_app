import Link from 'next/link';
import { BACK_LINK_TERMS, RIDE_UPDATES_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { UpdateComposer } from '@/features/organizer/updates/components/UpdateComposer';

// `/organizer/rides/[id]/updates` (`docs/design.md` §8 "Ride updates composer",
// CR-039). Inherits `CabinetShell`'s auth gate from `app/organizer/layout.tsx`;
// ownership is enforced server-side by `POST`/`GET /v1/rides/:id/updates`, not
// here — same pattern as `.../participants/page.tsx`.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideUpdatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <BackLink
          href="/organizer/rides"
          label={BACK_LINK_TERMS.toOrganizerRides}
        />
        <h1 className="text-h1 text-text">{RIDE_UPDATES_TERMS.pageTitle}</h1>
        <Link
          href={`/organizer/rides/${id}/edit`}
          className="inline-flex min-h-11 items-center text-body-sm font-medium text-primary hover:underline"
        >
          {RIDE_UPDATES_TERMS.backToEdit}
        </Link>
      </div>
      <UpdateComposer rideId={id} />
    </div>
  );
}
