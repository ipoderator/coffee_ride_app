'use client';

import { CABINET_TERMS, EmptyState } from 'ui';
import { useCurrentUser } from '@/lib/auth/current-user-context';

// Minimal organizer-cabinet-home stub (`docs/design.md` §8: "Dashboard (widgets
// from the ADR-009 registry)") — same reasoning as `app/me/page.tsx` (CR-013):
// just enough that `/organizer` isn't a 404 now that `CabinetShell` covers this
// cabinet too. Widget/registry content for this screen is CR-015, out of this
// ticket's scope (CR-014 is the Organizer profile screen).
export default function OrganizerCabinetHomePage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {CABINET_TERMS.organizerHomeTitle}
      </h1>
      <p className="text-sm text-text-secondary">{user.email}</p>
      <EmptyState
        title={CABINET_TERMS.organizerHomeEmptyTitle}
        description={CABINET_TERMS.organizerHomeEmptyDescription}
      />
    </div>
  );
}
