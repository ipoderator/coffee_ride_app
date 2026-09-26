'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { cn } from 'ui';
import { CABINET_ICONS } from '@/lib/cabinet/icons';
import type { CabinetNavItem } from '@/lib/cabinet/types';

/**
 * ADR-024 («Ночной старт») §1/§8: the organizer cabinet regains a desktop
 * sidebar — CR-108 moved cabinet nav into the one global `AppHeader`
 * dropdown, and that registry (`ORGANIZER_NAV_ITEMS`) stays the only source
 * of items; only the render changes. `CabinetShell` renders this only when a
 * cabinet passes `sidebarNavItems` (today: `/organizer/*` only) — `/me/*`
 * keeps the header-only nav, and every cabinet keeps it on mobile (no `lg:`
 * sidebar there, the bottom tab bar covers primary navigation instead).
 *
 * CR-131 (mockup screen 4): drawn as a raised panel, and an item is active on
 * its own page and every page under it (`/organizer/rides/…` keeps «Заезды»
 * lit) — except the cabinet root («Обзор»), which matches only itself.
 */
export function CabinetSidebar({ items }: { items: CabinetNavItem[] }) {
  const pathname = usePathname();

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Разделы кабинета"
      className="hidden shrink-0 flex-col gap-1 rounded-2xl border border-border bg-bg-raised p-2 lg:sticky lg:top-6 lg:flex lg:w-60"
    >
      {items.map((item) => {
        const Icon = item.icon ? CABINET_ICONS[item.icon] : null;
        const active = isActive(pathname, item.href, items);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:bg-surface hover:text-text',
              active && 'bg-surface text-text',
            )}
          >
            {Icon ? (
              <Icon
                className={cn('size-4 shrink-0', active && 'text-primary')}
                aria-hidden="true"
              />
            ) : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Exact match, or a sub-page — unless `href` is the root every other item's
 * `href` sits under (the overview), which would otherwise always be lit. */
function isActive(
  pathname: string,
  href: string,
  items: CabinetNavItem[],
): boolean {
  if (pathname === href) return true;
  const isRoot = items.some(
    (other) => other.href !== href && other.href.startsWith(`${href}/`),
  );
  return !isRoot && pathname.startsWith(`${href}/`);
}
