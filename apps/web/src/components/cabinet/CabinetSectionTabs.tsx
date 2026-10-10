'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
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
 *
 * CR-232: on a phone the later tabs start off-screen, so on load and on every
 * pathname change the row scrolls its own `scrollLeft` until the active tab is
 * fully visible. Not `scrollIntoView` — that also scrolls the page. Instant on
 * first render, smooth afterwards unless the user asked for reduced motion.
 */
export function CabinetSectionTabs({
  items,
  badges = {},
}: {
  items: CabinetNavItem[];
  badges?: CabinetNavBadgeCounts;
}) {
  const pathname = usePathname();
  const listRef = useRef<HTMLUListElement>(null);
  const hasScrolledRef = useRef(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const smooth =
      hasScrolledRef.current &&
      !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    hasScrolledRef.current = true;
    revealActiveTab(list, smooth);
  }, [pathname]);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={CABINET_NAV_BADGE_TERMS.sectionsLabel}
      className="border-b border-border lg:hidden"
    >
      <ul
        ref={listRef}
        className="flex gap-1.5 overflow-x-auto px-4 py-2.5 [scrollbar-width:none] md:px-6"
      >
        {items.map((item) => {
          const Icon = item.icon ? CABINET_ICONS[item.icon] : null;
          const active = isCabinetNavItemActive(pathname, item.href, items);
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-full px-3.5 text-body-sm font-semibold whitespace-nowrap text-text-secondary transition-colors hover:text-text focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary',
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

/** Scrolls `list` horizontally by the least distance that puts its
 * `aria-current` link inside the row's padding box (its start edge when the
 * link is wider than the row). No-op when it already fits, when nothing is
 * active, or at `lg`+ where the row is `display: none` and measures zero. */
function revealActiveTab(list: HTMLUListElement, smooth: boolean) {
  const link = list.querySelector<HTMLElement>('[aria-current="page"]');
  if (!link) return;
  const listBox = list.getBoundingClientRect();
  const linkBox = link.getBoundingClientRect();
  const style = getComputedStyle(list);
  const start = listBox.left + (parseFloat(style.paddingLeft) || 0);
  const end = listBox.right - (parseFloat(style.paddingRight) || 0);
  let delta = 0;
  if (linkBox.width > end - start || linkBox.left < start) {
    delta = linkBox.left - start;
  } else if (linkBox.right > end) {
    delta = linkBox.right - end;
  }
  if (delta === 0) return;
  list.scrollTo({
    left: list.scrollLeft + delta,
    behavior: smooth ? 'smooth' : 'auto',
  });
}
