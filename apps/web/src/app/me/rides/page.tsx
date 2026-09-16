'use client';

import { MY_REGISTRATIONS_TERMS } from 'ui';
import { MyRidesView } from '@/features/participant/my-rides/components/MyRidesView';

// `/me/rides` — "My registrations" (`docs/design.md` §8, CR-091). Session is
// already resolved by `CabinetShell` (the layout above this page); `MyRidesView`
// does its own data fetching, same pattern `ProfilePage` established for
// `ProfileForm`.
export default function MyRegistrationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {MY_REGISTRATIONS_TERMS.pageTitle}
      </h1>
      <MyRidesView />
    </div>
  );
}
