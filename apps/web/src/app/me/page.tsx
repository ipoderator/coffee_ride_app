'use client';

import { CABINET_TERMS, EmptyState } from 'ui';
import { useCurrentUser } from '@/lib/auth/current-user-context';

// Minimal cabinet-home stub (`docs/design.md` §8: "Participant cabinet
// home") — just enough that the route isn't a 404 now that `CabinetShell`
// exists. Widgets/registry content for this screen are CR-015/CR-054, out of
// this ticket's scope (CR-013 is the Profile screen).
export default function ParticipantCabinetHomePage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold text-text">
        {CABINET_TERMS.homeTitle}
      </h1>
      <p className="text-sm text-text-secondary">{user.email}</p>
      <EmptyState
        title={CABINET_TERMS.homeEmptyTitle}
        description={CABINET_TERMS.homeEmptyDescription}
      />
    </div>
  );
}
