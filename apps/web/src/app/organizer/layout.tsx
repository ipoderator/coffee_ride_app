import type { ReactNode } from 'react';
import { OrganizerCabinetFrame } from '@/components/cabinet/OrganizerCabinetFrame';
import { filterEnabled } from '@/lib/cabinet/feature-flags';
import { ORGANIZER_NAV_ITEMS } from '@/lib/cabinet/organizer-nav';
import type { CabinetNavItem } from '@/lib/cabinet/types';
import { ORGANIZER_NEAREST_RIDE_TERMS } from 'ui';

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
// CR-131 (mockup screen 4): the sidebar opens with «Обзор» → `/organizer`.
// Not a registry entry: the cabinet root isn't a feature, and `AppHeader`'s
// dropdown already renders its own fixed overview link ahead of the same
// registry — a registry entry would show it there twice.
// CR-132 (mockup screen 4): the cabinet is an app frame of its own —
// `OrganizerCabinetFrame` draws its header and sidebar column; the shared
// `AppHeader` is left off here by `SiteChrome` (root layout).
const OVERVIEW_ITEM: CabinetNavItem = {
  label: ORGANIZER_NEAREST_RIDE_TERMS.overviewNavLabel,
  href: '/organizer',
  order: 0,
  icon: 'House',
};

export default function OrganizerCabinetLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <OrganizerCabinetFrame
      navItems={[OVERVIEW_ITEM, ...filterEnabled(ORGANIZER_NAV_ITEMS)]}
    >
      {children}
    </OrganizerCabinetFrame>
  );
}
