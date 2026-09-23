import { BACK_LINK_TERMS } from 'ui';
import { BackLink } from '@/components/site/BackLink';
import { RideDetailView } from '@/features/participant/ride-detail/components/RideDetailView';

// `/rides/[id]` (`docs/design.md` §8 "Ride detail", CR-023). Deliberately NOT under
// `app/organizer/` or `app/me/` — no `CabinetShell`, no auth gate. `GET /v1/rides/:id`
// (`apps/api/src/modules/rides/rides.service.ts`'s `getRideForViewer`) is the server-
// side authority on what's visible to an unauthenticated/non-owner viewer;
// `RideDetailView` renders whatever it returns.
//
// CR-119: map-first «Топокарта» layout — the sticky mobile registration bar
// (CR-105) is the default now, so `FEATURE_STICKY_REGISTRATION_CTA` is gone, as
// is the retired glass cover panel (`FEATURE_COVER_GLASS_PANEL`, ADR-021). The
// bar's own bottom spacer lives in `RideDetailView`, which knows when the bar is
// shown. 16px side gutter on a phone.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <main className="mx-auto flex w-full flex-col gap-4 px-4 py-6 sm:px-6">
      {/* CR-109: `/rides/[id]` is the app's most-shared URL, so its visitor is
          the one most likely to have arrived with no history to go back to. */}
      <BackLink href="/" label={BACK_LINK_TERMS.toDiscovery} />
      <RideDetailView rideId={id} />
    </main>
  );
}
