import { RideWorkspace } from '@/features/organizer/rides/components/RideWorkspace';
import { UpdateComposer } from '@/features/organizer/updates/components/UpdateComposer';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_RIDE_SECTIONS } from '@/lib/cabinet/organizer-ride-sections';

// `/organizer/rides/[id]/updates` (`docs/design.md` §8 "Ride updates composer",
// CR-039; the ride workspace's «Обновления» tab since CR-187). Inherits
// `CabinetShell`'s auth gate from `app/organizer/layout.tsx`; ownership is
// enforced server-side by `POST`/`GET /v1/rides/:id/updates`, not here.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideUpdatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RideWorkspace
      rideId={id}
      current="updates"
      sections={filterEnabled(ORGANIZER_RIDE_SECTIONS)}
    >
      <UpdateComposer rideId={id} />
    </RideWorkspace>
  );
}
