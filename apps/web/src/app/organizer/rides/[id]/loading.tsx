import { Skeleton } from 'ui';

// Shared Next.js loading boundary for every `/organizer/rides/[id]/*` leaf
// (`edit`, `route`, `cover`, `participants`, `updates`) — CR-099. Each leaf's
// own client component already shows a matching `Skeleton` once it mounts
// (`EditRideForm`, `RouteUploadForm`, `CoverImageUploadForm`, ...), but
// without this file the App Router shows nothing at all during the RSC
// navigation itself (fetching/rendering the new route segment) — this file
// is what actually covers that gap, not a duplicate of the per-form ones.
export default function RideDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
