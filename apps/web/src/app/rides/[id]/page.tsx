import { RideDetailView } from '@/features/participant/ride-detail/components/RideDetailView';
import { isFeatureEnabled } from '@/lib/cabinet/feature-flags';

// `/rides/[id]` (`docs/design.md` §8 "Ride detail", CR-023). Deliberately NOT under
// `app/organizer/` or `app/me/` — no `CabinetShell`, no auth gate. `GET /v1/rides/:id`
// (`apps/api/src/modules/rides/rides.service.ts`'s `getRideForViewer`) is the server-
// side authority on what's visible to an unauthenticated/non-owner viewer;
// `RideDetailView` renders whatever it returns.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // CR-105 (`/impeccable critique` P1 item 4): sticky mobile registration CTA,
  // gated per `.claude/rules/extensibility.md`/CR-055. `isFeatureEnabled` is
  // server-only (`@/lib/cabinet/feature-flags`'s own doc comment), so it's read
  // here and threaded down as a prop rather than from `RideDetailView` itself,
  // which is a Client Component. `pb-24 md:pb-6` mirrors `CabinetShell`'s own
  // fixed-bottom-bar spacer so the bar never overlaps page content.
  const stickyRegistrationCta = isFeatureEnabled('STICKY_REGISTRATION_CTA');
  return (
    <main
      className={
        stickyRegistrationCta
          ? 'mx-auto flex max-w-4xl flex-col gap-6 p-6 pb-24 md:pb-6'
          : 'mx-auto flex max-w-4xl flex-col gap-6 p-6'
      }
    >
      <RideDetailView
        rideId={id}
        stickyRegistrationCta={stickyRegistrationCta}
      />
    </main>
  );
}
