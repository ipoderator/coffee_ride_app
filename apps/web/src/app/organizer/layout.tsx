import type { ReactNode } from 'react';
import { CabinetShell } from '@/components/cabinet/CabinetShell';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_NAV_ITEMS } from '@/lib/cabinet/organizer-nav';

// Session gate for every `/organizer/*` screen (`docs/design.md` §8), same
// mechanics as `app/me/layout.tsx` — see `CabinetShell`. Organizer capability
// itself is not gated here: creating an `OrganizerProfile`
// (`/organizer/profile`) is how a `User` obtains it in the first place, so this
// layout only requires an ordinary logged-in session, same as the participant
// cabinet (`.claude/rules/security.md`: ownership/capability checks happen
// server-side per action, not as a blanket route gate here).
//
// CR-108 moved the nav registry's *rendering* into the one global `AppHeader`
// dropdown; ADR-024 gives the organizer cabinet a desktop sidebar back, fed
// by the same `ORGANIZER_NAV_ITEMS` registry `AppHeader` still reads for its
// own dropdown/mobile panel — a Server Component filters it here, same as
// `app/layout.tsx` does, since `filterEnabled` needs server-only env vars.
export default function OrganizerCabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <CabinetShell sidebarNavItems={filterEnabled(ORGANIZER_NAV_ITEMS)}>
      {children}
    </CabinetShell>
  );
}
