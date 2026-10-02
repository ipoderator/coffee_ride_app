'use client';

import Link from 'next/link';
import { cn, RIDE_WORKSPACE_TERMS } from 'ui';
import type { RideSectionLink } from '@/lib/cabinet/types';

/** The overview tab's segment — the ride's own `/edit` page. */
export const OVERVIEW_SEGMENT = 'edit';

/**
 * CR-187: the ride's six local tabs — «Обзор» plus the ADR-009 sub-page
 * registry. Route links with `aria-current`, not an ARIA `tablist`: each tab
 * is its own page. From `lg` an underlined row; below it a 3×2 (then 6×1)
 * grid of bordered cells, so every section stays visible without a hidden
 * horizontal scroll — and so it never looks like the cabinet's own section
 * strip, which is the horizontally scrolling row at those widths.
 *
 * KI-085: a third of a 320–360 px phone is narrower than «Обновления», which
 * then broke as «Обновле-ния». Under 21rem of nav width the grid is 2×3
 * instead; a container query in rem, so larger text moves the switch too.
 */
export function RideWorkspaceTabs({
  rideId,
  current,
  sections,
}: {
  rideId: string;
  /** `OVERVIEW_SEGMENT` or a section's `segment`. */
  current: string;
  sections: readonly RideSectionLink[];
}) {
  const items = [
    { segment: OVERVIEW_SEGMENT, label: RIDE_WORKSPACE_TERMS.overviewTab },
    ...sections.map(({ segment, label }) => ({ segment, label })),
  ];

  return (
    <nav aria-label={RIDE_WORKSPACE_TERMS.tabsLabel} className="@container">
      <ul className="grid grid-cols-2 gap-2 max-md:@min-[21rem]:grid-cols-3 md:grid-cols-6 lg:flex lg:gap-1 lg:border-b lg:border-border">
        {items.map((item) => {
          const active = item.segment === current;
          return (
            <li key={item.segment} className="min-w-0">
              <Link
                href={`/organizer/rides/${rideId}/${item.segment}`}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-full min-h-11 items-center justify-center rounded-lg border px-1 text-center text-body-sm font-semibold hyphens-auto transition-colors',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  'lg:-mb-px lg:rounded-none lg:border-x-0 lg:border-t-0 lg:border-b-2 lg:bg-transparent lg:px-4',
                  active
                    ? 'border-primary bg-surface text-text'
                    : 'border-border text-text-secondary hover:bg-surface hover:text-text lg:border-transparent lg:hover:bg-transparent',
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
