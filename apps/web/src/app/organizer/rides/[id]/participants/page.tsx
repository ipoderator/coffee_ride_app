import { ParticipantTable } from '@/features/organizer/participants/components/ParticipantTable';
import { WaitlistTable } from '@/features/organizer/participants/components/WaitlistTable';
import { RideWorkspace } from '@/features/organizer/rides/components/RideWorkspace';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_RIDE_SECTIONS } from '@/lib/cabinet/organizer-ride-sections';

// `/organizer/rides/[id]/participants` (`docs/design.md` §8 "Participants +
// waitlist", CR-037; the ride workspace's «Участники» tab since CR-187 — the
// workspace head says which ride this is, which CR-185's `RideContextHeader`
// did before). Inherits `CabinetShell`'s auth gate from
// `app/organizer/layout.tsx`; ownership is enforced server-side by
// `GET /v1/rides/:id/participants` and `.../waitlist`, not here.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideParticipantsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RideWorkspace
      rideId={id}
      current="participants"
      sections={filterEnabled(ORGANIZER_RIDE_SECTIONS)}
    >
      <ParticipantTable rideId={id} />
      <WaitlistTable rideId={id} />
    </RideWorkspace>
  );
}
