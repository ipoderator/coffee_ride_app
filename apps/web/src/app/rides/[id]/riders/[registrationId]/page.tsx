import { BACK_LINK_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { RiderProfileCard } from '@/features/participant/rider-profile/components/RiderProfileCard';
import {
  parseRiderProfileOrigin,
  type RiderProfileOrigin,
} from '@/lib/rides/rider-profile-href';

// `/rides/[id]/riders/[registrationId]` (CR-126): a rider's profile card,
// reached via a link from that ride's «Участники» list (`RidersSection.tsx`)
// and, since CR-149, from the organizer's cabinet (the dashboard's «Новые
// записи» feed and a ride's participant table) — `?from=` sends the back link
// there instead of to the public ride page. Same shape as `/rides/[id]/page.tsx`
// — no `CabinetShell`, no auth gate at the route level (`RiderProfileCard`
// itself handles the signed-in-only/access-gated states the API can return).
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
function backLink(
  rideId: string,
  from: RiderProfileOrigin | null,
): { href: string; label: string } {
  switch (from) {
    case 'overview':
      return { href: '/organizer', label: BACK_LINK_TERMS.toOrganizerOverview };
    case 'participants':
      return {
        href: `/organizer/rides/${rideId}/participants`,
        label: BACK_LINK_TERMS.toRideParticipants,
      };
    default:
      return { href: `/rides/${rideId}`, label: BACK_LINK_TERMS.toRide };
  }
}

export default async function RiderProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; registrationId: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id, registrationId } = await params;
  const back = backLink(id, parseRiderProfileOrigin((await searchParams).from));
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
      <BackLink href={back.href} label={back.label} />
      <RiderProfileCard rideId={id} registrationId={registrationId} />
    </main>
  );
}
