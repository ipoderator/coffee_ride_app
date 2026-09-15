import { RIDE_ROUTE_TERMS } from 'ui';
import { RouteUploadForm } from '@/features/organizer/route/components/RouteUploadForm';

// `/organizer/rides/[id]/route` (`docs/design.md` §8 "Route, GPX upload, stops,
// route points" — CR-027 ships the GPX upload slice). Inherits `CabinetShell`'s auth
// gate from `app/organizer/layout.tsx`; ownership is enforced server-side by
// `GET`/`POST`/`PATCH`/`DELETE /v1/rides/:id/route`, not here.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideRoutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {RIDE_ROUTE_TERMS.pageTitle}
      </h1>
      <RouteUploadForm rideId={id} />
    </div>
  );
}
