import { RIDE_CREATE_TERMS } from 'ui';
import { CreateRideForm } from '@/features/organizer/rides/components/CreateRideForm';

// `/organizer/rides/new` (`docs/design.md` §8 "Create ride", CR-017). Inherits
// `CabinetShell`'s auth gate from `app/organizer/layout.tsx` — no route-level guard
// needed here.
export default function CreateRidePage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {RIDE_CREATE_TERMS.pageTitle}
      </h1>
      <CreateRideForm />
    </div>
  );
}
