import { PARTICIPANTS_TERMS } from 'ui';
import { ParticipantTable } from '@/features/organizer/participants/components/ParticipantTable';
import { WaitlistTable } from '@/features/organizer/participants/components/WaitlistTable';

// `/organizer/rides/[id]/participants` (`docs/design.md` §8 "Participants +
// waitlist", CR-037). Inherits `CabinetShell`'s auth gate from
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
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {PARTICIPANTS_TERMS.pageTitle}
      </h1>
      <ParticipantTable rideId={id} />
      <WaitlistTable rideId={id} />
    </div>
  );
}
