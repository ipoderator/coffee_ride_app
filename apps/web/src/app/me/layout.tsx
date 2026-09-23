import type { ReactNode } from 'react';
import { CabinetShell } from '@/components/cabinet/CabinetShell';

// Session gate for every `/me/*` screen (`docs/design.md` §8) — see
// `CabinetShell` for the mechanics. CR-108: the nav registry is no longer
// passed from here; the one global `AppHeader` renders it (still
// flag-filtered server-side, now in `app/layout.tsx`).
export default function ParticipantCabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CabinetShell>{children}</CabinetShell>;
}
