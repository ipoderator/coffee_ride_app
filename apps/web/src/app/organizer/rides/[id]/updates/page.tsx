import { BACK_LINK_TERMS, RIDE_UPDATES_TERMS } from 'ui';
import { RideContextHeader } from '@/components/cabinet/RideContextHeader';
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
      <BackLink
        href="/organizer/rides"
        label={BACK_LINK_TERMS.toOrganizerRides}
      />
      {/* CR-185: the ride these updates go to (title, start, status, a link
          to its management view) — the sidebar lands here for the nearest
          ride. Replaces the bare «К редактированию заезда» link. */}
      <header className="flex flex-col gap-3">
        <h1 className="text-h1 text-text">{RIDE_UPDATES_TERMS.pageTitle}</h1>
        <RideContextHeader rideId={id} />
      </header>
      <UpdateComposer rideId={id} />
    </div>
  );
}
