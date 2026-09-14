import type { ReactNode } from 'react';
import { CabinetShell } from '@/components/cabinet/CabinetShell';

// Shared shell for every `/me/*` screen (`docs/design.md` §8) — see
// `CabinetShell` for the session-gating/registry mechanics.
export default function ParticipantCabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CabinetShell>{children}</CabinetShell>;
}
