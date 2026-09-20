import { RIDE_COVER_TERMS } from 'ui';
import { CoverImageUploadForm } from '@/features/organizer/cover-image/components/CoverImageUploadForm';

// `/organizer/rides/[id]/cover` (ADR-019/CR-086, `docs/design.md` §14). Inherits
// `CabinetShell`'s auth gate from `app/organizer/layout.tsx`; ownership is
// enforced server-side by `GET`/`POST`/`PATCH`/`DELETE /v1/rides/:id/cover`, not
// here — same precedent as `RideRoutePage`.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideCoverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {RIDE_COVER_TERMS.pageTitle}
      </h1>
      <CoverImageUploadForm rideId={id} />
    </div>
  );
}
