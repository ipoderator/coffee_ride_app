'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { CABINET_NAV_BADGE_TERMS, cn } from 'ui';
import { CABINET_ICONS } from '@/lib/cabinet/icons';
import type {
  CabinetNavBadgeCounts,
  CabinetNavItem,
} from '@/lib/cabinet/types';
import { isCabinetNavItemActive, NavBadge } from './CabinetSidebar';

/**
 * CR-132: `CabinetSidebar`'s items below `lg`, as one horizontally scrolling
 * row of pills under the organizer header — the sidebar column doesn't fit a
 * phone, and the organizer header (unlike `AppHeader`) has no section menu
 * of its own. Same registry, same active rule, same badges.
 */
export function CabinetSectionTabs({
  items,
  badges = {},
}: {
  items: CabinetNavItem[];
  badges?: CabinetNavBadgeCounts;
}) {
  const pathname = usePathname();

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={CABINET_NAV_BADGE_TERMS.sectionsLabel}
      className="border-b border-border lg:hidden"
    >
      <ul className="flex gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] md:px-6">
        {items.map((item) => {
          const Icon = item.icon ? CABINET_ICONS[item.icon] : null;
          const active = isCabinetNavItemActive(pathname, item.href, items);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap text-text-secondary transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
                  active && 'bg-surface text-text',
                )}
              >
                {Icon ? (
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                ) : null}
                {item.label}
                <NavBadge item={item} badges={badges} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
