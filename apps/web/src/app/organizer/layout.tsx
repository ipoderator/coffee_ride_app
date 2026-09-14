import type { ReactNode } from 'react';
import { CabinetShell } from '@/components/cabinet/CabinetShell';
import { ORGANIZER_NAV_ITEMS } from '@/lib/cabinet/organizer-nav';

// Shared shell for every `/organizer/*` screen (`docs/design.md` §8), same
// mechanics as `app/me/layout.tsx` — see `CabinetShell`. Organizer capability
// itself is not gated here: creating an `OrganizerProfile` (this ticket's
// `/organizer/profile`) is how a `User` obtains it in the first place, so this
// layout only requires an ordinary logged-in session, same as the participant
// cabinet (`.claude/rules/security.md`: ownership/capability checks happen
// server-side per action, not as a blanket route gate here).
export default function OrganizerCabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <CabinetShell navItems={ORGANIZER_NAV_ITEMS}>{children}</CabinetShell>;
}
