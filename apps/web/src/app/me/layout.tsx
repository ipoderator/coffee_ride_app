import type { ReactNode } from 'react';
import { CabinetShell } from '@/components/cabinet/CabinetShell';
import { PARTICIPANT_NAV_ITEMS } from '@/lib/cabinet/participant-nav';

// Shared shell for every `/me/*` screen (`docs/design.md` §8) — see
// `CabinetShell` for the session-gating/registry mechanics. CR-014
// generalized `CabinetShell` to take `navItems`, so this layout now passes
// the participant registry explicitly (the organizer cabinet passes its own,
// `app/organizer/layout.tsx`).
export default function ParticipantCabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <CabinetShell navItems={PARTICIPANT_NAV_ITEMS}>{children}</CabinetShell>
  );
}
