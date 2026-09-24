import { BACK_LINK_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { RiderProfileCard } from '@/features/participant/rider-profile/components/RiderProfileCard';

// `/rides/[id]/riders/[registrationId]` (CR-126): a rider's profile card,
// reached only via a link from that ride's «Участники» list
// (`RidersSection.tsx`). Same shape as `/rides/[id]/page.tsx` — no
// `CabinetShell`, no auth gate at the route level (`RiderProfileCard` itself
// handles the signed-in-only/access-gated states the API can return).
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RiderProfilePage({
  params,
}: {
  params: Promise<{ id: string; registrationId: string }>;
}) {
  const { id, registrationId } = await params;
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <BackLink href={`/rides/${id}`} label={BACK_LINK_TERMS.toRide} />
      <RiderProfileCard rideId={id} registrationId={registrationId} />
    </main>
  );
}
