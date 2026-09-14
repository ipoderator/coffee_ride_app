import { RIDE_LIST_TERMS } from 'ui';
import { RidesList } from '@/features/organizer/rides/components/RidesList';

// `/organizer/rides` (`docs/design.md` §8 "My rides", CR-088). Inherits
// `CabinetShell`'s auth gate from `app/organizer/layout.tsx` — no route-level guard
// needed here.
export default function OrganizerRidesPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {RIDE_LIST_TERMS.pageTitle}
      </h1>
      <RidesList />
    </div>
  );
}
