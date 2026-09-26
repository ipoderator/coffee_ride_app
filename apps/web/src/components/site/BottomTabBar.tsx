'use client';

import {
  CalendarDays,
  CircleUser,
  Map as MapIcon,
  Plus,
  Route,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { BOTTOM_TAB_BAR_TERMS, cn } from 'ui';

interface Tab {
  href: string;
  label: string;
  Icon: LucideIcon;
  isActive: (pathname: string, view: string | null) => boolean;
  /** The centre «+» action, drawn as a filled pill (mockup `.fab`). */
  primary?: boolean;
}

// The five mockup tabs (ADR-024, «нижние вкладки на мобильном»). Fixed
// site-level destinations, like `AppHeader`'s own `/` link — not a cabinet
// feature list, so not an ADR-009 registry: the full per-cabinet menus stay
// in `AppHeader`'s mobile panel, which this bar complements, not replaces.
const TABS: Tab[] = [
  {
    href: '/',
    label: BOTTOM_TAB_BAR_TERMS.rides,
    Icon: Route,
    isActive: (pathname, view) => pathname === '/' && view !== 'map',
  },
  {
    href: '/?view=map',
    label: BOTTOM_TAB_BAR_TERMS.map,
    Icon: MapIcon,
    isActive: (pathname, view) => pathname === '/' && view === 'map',
  },
  {
    href: '/organizer/rides/new',
    label: BOTTOM_TAB_BAR_TERMS.create,
    Icon: Plus,
    isActive: (pathname) => pathname === '/organizer/rides/new',
    primary: true,
  },
  {
    href: '/me/rides',
    label: BOTTOM_TAB_BAR_TERMS.mine,
    Icon: CalendarDays,
    isActive: (pathname) => pathname.startsWith('/me/rides'),
  },
  {
    href: '/me',
    label: BOTTOM_TAB_BAR_TERMS.me,
    Icon: CircleUser,
    isActive: (pathname) =>
      pathname === '/me' ||
      (pathname.startsWith('/me/') && !pathname.startsWith('/me/rides')),
  },
];

/**
 * A ride's own page carries its sticky «Записаться» bar at the same screen
 * edge (mockup screen 2 shows no tab bar there), so the tab bar steps aside.
 */
function isHiddenOn(pathname: string): boolean {
  return /^\/rides\/[^/]+\/?$/.test(pathname);
}

// Height of the bar above the safe-area inset (`h-16`).
const BAR_HEIGHT = '4rem';

/**
 * Mobile-only bottom tab bar (CR-130, ADR-024). Below `md` it's fixed to the
 * screen's bottom edge; a same-height spacer keeps it from covering the end
 * of the page, and `--app-bottom-inset` lifts `Toast` above it.
 *
 * `useSearchParams` (for the «Карта» tab's `?view=map`) needs a Suspense
 * boundary on statically rendered routes; the fallback is the same bar
 * without the search params, so the bar is in the prerendered HTML too.
 */
export function BottomTabBar() {
  return (
    <Suspense fallback={<TabBar view={null} />}>
      <TabBarWithSearchParams />
    </Suspense>
  );
}

function TabBarWithSearchParams() {
  const searchParams = useSearchParams();
  return <TabBar view={searchParams.get('view')} />;
}

function TabBar({ view }: { view: string | null }) {
  const pathname = usePathname();
  const hidden = isHiddenOn(pathname);

  useEffect(() => {
    if (hidden) return;
    const root = document.documentElement;
    root.style.setProperty('--app-bottom-inset', BAR_HEIGHT);
    return () => {
      root.style.removeProperty('--app-bottom-inset');
    };
  }, [hidden]);

  if (hidden) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden"
      />
      <nav
        aria-label={BOTTOM_TAB_BAR_TERMS.navLabel}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg-raised pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid h-16 grid-cols-5 items-center px-1">
          {TABS.map(({ href, label, Icon, isActive, primary }) => {
            const active = isActive(pathname, view);
            return (
              <li key={href} className="flex justify-center">
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1 font-mono text-[0.625rem] font-medium tracking-wide uppercase',
                    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    active ? 'text-primary' : 'text-text-muted hover:text-text',
                  )}
                >
                  {primary ? (
                    <span className="flex h-8 w-11 items-center justify-center rounded-full bg-primary-fill text-on-primary-fill">
                      <Icon className="size-5" aria-hidden="true" />
                    </span>
                  ) : (
                    <Icon className="size-5" aria-hidden="true" />
                  )}
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
