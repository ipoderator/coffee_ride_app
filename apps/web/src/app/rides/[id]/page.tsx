import { RideDetailView } from '@/features/participant/ride-detail/components/RideDetailView';

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
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <RideDetailView rideId={id} />
    </main>
  );
}
