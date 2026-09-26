'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { CABINET_TERMS, ErrorState, Skeleton } from 'ui';
import { CurrentUserContext } from '@/lib/auth/current-user-context';
import { useSession } from '@/lib/auth/session-context';
import type {
  CabinetNavBadgeCounts,
  CabinetNavItem,
} from '@/lib/cabinet/types';
import { CabinetAccountBar } from './CabinetAccountBar';
import { CabinetSectionTabs } from './CabinetSectionTabs';
import { CabinetSidebar } from './CabinetSidebar';

/**
 * Session gate for every `/me/*` and `/organizer/*` screen. Redirects to
 * `/login` when nobody is signed in — never renders protected content first —
 * and provides the resolved user to nested pages via context so they don't
 * each re-fetch it (`@/lib/auth/current-user-context`).
 *
 * Both cabinets require the same participant-tier session — organizer
 * capability is a separate, per-action server-side check
 * (`.claude/rules/security.md`), not a different login, so the redirect target
 * stays `/login` for both.
 *
 * CR-108 narrowed this to exactly that gate. It used to own the cabinet's nav
 * column and resolve the session itself; navigation now lives in the one
 * global `AppHeader` (which renders the same ADR-009 registries, so adding a
 * cabinet feature is still a descriptor and not a branch), and the session is
 * resolved once by `SessionProvider` for the header and this gate to share.
 *
 * ADR-024: `sidebarNavItems` is optional and additive — when a cabinet layout
 * passes it (today: `/organizer/*`), a desktop `CabinetSidebar` renders next
 * to `children` from the same ADR-009 registry `AppHeader` already reads;
 * omitting it (still `/me/*`) keeps the pre-ADR-024 header-only layout
 * exactly as it was.
 *
 * CR-132 (mockup screen 4): with `sidebarNavItems` the shell is an app frame
 * under the cabinet's own header (`OrganizerHeader`) — a full-height sidebar
 * column (section pills below `lg`) and the page beside it, full width. No
 * CR-127 account bar there: that header's account menu shows who is signed
 * in and signs out. `navBadges` feeds the items' live counters.
 */
export function CabinetShell({
  children,
  sidebarNavItems,
  navBadges,
}: {
  children: ReactNode;
  sidebarNavItems?: CabinetNavItem[];
  navBadges?: CabinetNavBadgeCounts;
}) {
  const router = useRouter();
  const { status, user } = useSession();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  // `anonymous` keeps showing the skeleton rather than falling through to the
  // error state: the redirect above is already in flight, and flashing "не
  // удалось загрузить" at someone who is simply signed out would be a lie.
  if (status === 'loading' || status === 'anonymous') {
    return (
      <div
        aria-busy="true"
        aria-label={CABINET_TERMS.loadingCurrentUser}
        className="mx-auto flex max-w-3xl flex-col gap-4 p-6"
      >
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (status === 'error' || !user) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <ErrorState message={CABINET_TERMS.loadCurrentUserError} />
      </div>
    );
  }

  if (sidebarNavItems) {
    return (
      <CurrentUserContext.Provider value={user}>
        {/* The row fills the viewport below the header (`OrganizerHeader`'s
            4.25rem + its 1px border) so the sidebar's border runs to the
            bottom, as in the mockup. */}
        <div className="lg:flex lg:min-h-[calc(100dvh-4.25rem-1px)]">
          <CabinetSidebar items={sidebarNavItems} badges={navBadges} />
          <div className="min-w-0 flex-1">
            <CabinetSectionTabs items={sidebarNavItems} badges={navBadges} />
            <main className="mx-auto w-full max-w-6xl p-4 md:p-6">
              {children}
            </main>
          </div>
        </div>
      </CurrentUserContext.Provider>
    );
  }

  return (
    <CurrentUserContext.Provider value={user}>
      <div className="mx-auto min-h-screen w-full max-w-5xl p-6">
        <CabinetAccountBar user={user} />
        <main className="min-w-0">{children}</main>
      </div>
    </CurrentUserContext.Provider>
  );
}
