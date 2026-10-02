import { CoverImageUploadForm } from '@/features/organizer/cover-image/components/CoverImageUploadForm';
import { RideWorkspace } from '@/features/organizer/rides/components/RideWorkspace';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_RIDE_SECTIONS } from '@/lib/cabinet/organizer-ride-sections';

// `/organizer/rides/[id]/cover` (ADR-019/CR-086, `docs/design.md` §14; the
// ride workspace's «Обложка» tab since CR-187). Inherits `CabinetShell`'s auth
// gate from `app/organizer/layout.tsx`; ownership is enforced server-side by
// `GET`/`POST`/`PATCH`/`DELETE /v1/rides/:id/cover`, not here.
//
// Next.js 15: `params` is a `Promise` for a dynamic route page, not a plain object.
export default async function RideCoverPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <RideWorkspace
      rideId={id}
      current="cover"
      sections={filterEnabled(ORGANIZER_RIDE_SECTIONS)}
    >
      <CoverImageUploadForm rideId={id} />
    </RideWorkspace>
  );
}
