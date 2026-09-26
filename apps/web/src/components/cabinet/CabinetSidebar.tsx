'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { CABINET_NAV_BADGE_TERMS, cn } from 'ui';
import { CABINET_ICONS } from '@/lib/cabinet/icons';
import type {
  CabinetNavBadgeCounts,
  CabinetNavItem,
} from '@/lib/cabinet/types';

/**
 * ADR-024 («Ночной старт») §1/§8: the organizer cabinet regains a desktop
 * sidebar — CR-108 moved cabinet nav into the one global `AppHeader`
 * dropdown, and that registry (`ORGANIZER_NAV_ITEMS`) stays the only source
 * of items; only the render changes. `CabinetShell` renders this only when a
 * cabinet passes `sidebarNavItems` (today: `/organizer/*` only) — `/me/*`
 * keeps the header-only nav. Below `lg` the same items render as
 * `CabinetSectionTabs` instead.
 *
 * CR-131: an item is active on its own page and every page under it
 * (`/organizer/rides/…` keeps «Заезды» lit) — except the cabinet root
 * («Обзор»), which matches only itself.
 *
 * CR-132 (mockup screen 4): a full-height column with a right border, not a
 * floating panel, and an item whose descriptor names a `badge` shows its
 * live count (`badges`) as a pill.
 */
export function CabinetSidebar({
  items,
  badges = {},
}: {
  items: CabinetNavItem[];
  badges?: CabinetNavBadgeCounts;
}) {
  const pathname = usePathname();

  if (items.length === 0) return null;

  return (
    <aside className="hidden w-72 shrink-0 border-r border-border lg:block">
      <nav
        aria-label={CABINET_NAV_BADGE_TERMS.sectionsLabel}
        className="sticky top-0 flex flex-col gap-1.5 p-4"
      >
        {items.map((item) => {
          const Icon = item.icon ? CABINET_ICONS[item.icon] : null;
          const active = isCabinetNavItemActive(pathname, item.href, items);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold text-text-secondary transition-colors hover:bg-surface hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                active && 'bg-surface text-text',
              )}
            >
              {Icon ? (
                <Icon className="size-5 shrink-0" aria-hidden="true" />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <NavBadge item={item} badges={badges} />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

/**
 * The count pill for an item whose descriptor names a `badge`; nothing while
 * the count is unknown or zero. The visible number is decorative — the
 * screen-reader sentence carries its meaning («3 новые записи за сутки»).
 */
export function NavBadge({
  item,
  badges,
}: {
  item: CabinetNavItem;
  badges: CabinetNavBadgeCounts;
}) {
  const count = item.badge ? badges[item.badge] : undefined;
  if (!item.badge || !count) return null;
  return (
    <>
      <span
        aria-hidden="true"
        className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-fill px-1.5 font-num text-sm font-bold text-on-primary-fill tabular-nums"
      >
        {count}
      </span>
      <span className="sr-only">
        , {CABINET_NAV_BADGE_TERMS[item.badge](count)}
      </span>
    </>
  );
}

/** Exact match, or a sub-page — unless `href` is the root every other item's
 * `href` sits under (the overview), which would otherwise always be lit. */
export function isCabinetNavItemActive(
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
