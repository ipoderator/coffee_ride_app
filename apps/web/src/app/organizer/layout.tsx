import type { ReactNode } from 'react';
import { CabinetShell } from '@/components/cabinet/CabinetShell';

// Session gate for every `/organizer/*` screen (`docs/design.md` §8), same
// mechanics as `app/me/layout.tsx` — see `CabinetShell`. Organizer capability
// itself is not gated here: creating an `OrganizerProfile`
// (`/organizer/profile`) is how a `User` obtains it in the first place, so this
// layout only requires an ordinary logged-in session, same as the participant
// cabinet (`.claude/rules/security.md`: ownership/capability checks happen
// server-side per action, not as a blanket route gate here).
//
// CR-108: the nav registry is no longer passed from here — the one global
// `AppHeader` renders it (still flag-filtered server-side, now in
// `app/layout.tsx`).
export default function OrganizerCabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CabinetShell>{children}</CabinetShell>;
}
