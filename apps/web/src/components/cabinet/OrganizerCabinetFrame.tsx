'use client';

import type { ReactNode } from 'react';
import { useSession } from '@/lib/auth/session-context';
import type { CabinetNavItem } from '@/lib/cabinet/types';
import { useOrganizerNavBadges } from '@/lib/organizer/nav-badges';
import { CabinetShell } from './CabinetShell';
import { OrganizerHeader } from './OrganizerHeader';

/**
 * CR-132: the organizer cabinet's app frame — its own header over
 * `CabinetShell`'s sidebar frame, with the sidebar's live counters resolved
 * here (the registry arrives flag-filtered from `app/organizer/layout.tsx`,
 * a Server Component that can't run the hook).
 */
export function OrganizerCabinetFrame({
  navItems,
  children,
}: {
  navItems: CabinetNavItem[];
  children: ReactNode;
}) {
  const { status } = useSession();
  const badges = useOrganizerNavBadges(
    status === 'authenticated' && navItems.some((item) => item.badge),
  );

  return (
    <>
      <OrganizerHeader />
      <CabinetShell sidebarNavItems={navItems} navBadges={badges}>
        {children}
      </CabinetShell>
    </>
  );
}
