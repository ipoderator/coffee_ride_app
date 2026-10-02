'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn, RIDE_READINESS_TERMS, RIDE_WORKSPACE_TERMS } from 'ui';
import type { StatusTone } from 'ui';
import { CABINET_ICONS } from '@/lib/cabinet/icons';
import { ORGANIZER_RIDE_READINESS } from '@/lib/cabinet/organizer-ride-readiness';
import type {
  RideSectionReadiness,
  RideWorkspaceData,
} from '@/lib/cabinet/ride-workspace';
import type { RideSectionLink } from '@/lib/cabinet/types';

// Supplementary only — every row's title already says the state in words.
const TILE_TONE: Record<StatusTone, string> = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
  danger: 'bg-danger/10 text-danger',
  neutral: 'bg-surface text-text-secondary',
};

/**
 * CR-187: the overview's «Перед стартом» list — one row per ride section with
 * its concrete state («Маршрут готов · 42 км · 380 м набора»), not a grid of
 * identical arrow cards (replaces CR-186's `RideSectionNav`). Rows come from
 * the ADR-009 section registry; each state from that section's own
 * `readiness.ts` (`ORGANIZER_RIDE_READINESS`). A section with nothing to say
 * at this status has no row; a row whose step isn't doable has no link.
 */
export function RideReadinessList({
  rideId,
  sections,
  data,
  labelledBy,
}: {
  rideId: string;
  sections: readonly RideSectionLink[];
  data: RideWorkspaceData;
  /** Id of the heading this list sits under. */
  labelledBy?: string;
}) {
  const rows = sections.flatMap((section) => {
    const resolver = ORGANIZER_RIDE_READINESS[section.segment];
    const readiness: RideSectionReadiness | null = resolver
      ? resolver(data)
      : {
          tone: 'neutral',
          title: section.label,
          detail: section.hint,
          chip: section.label,
          action: RIDE_READINESS_TERMS.fallbackAction,
        };
    return readiness ? [{ section, readiness }] : [];
  });
  if (rows.length === 0) return null;

  return (
    <ul
      aria-labelledby={labelledBy}
      className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-bg-raised"
    >
      {rows.map(({ section, readiness }) => {
        const Icon = section.icon ? CABINET_ICONS[section.icon] : null;
        return (
          <li
            key={section.segment}
            className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:gap-x-4"
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-10 items-center justify-center rounded-xl',
                TILE_TONE[readiness.tone],
              )}
            >
              {Icon ? <Icon className="size-5" aria-hidden="true" /> : null}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-body font-semibold text-text">
                {readiness.title}
              </p>
              {readiness.detail ? (
                <p className="text-body-sm text-text-secondary wrap-anywhere">
                  {readiness.detail}
                </p>
              ) : null}
            </div>
            {readiness.action ? (
              <Link
                href={`/organizer/rides/${rideId}/${section.segment}`}
                aria-label={RIDE_WORKSPACE_TERMS.rowActionLabel(
                  readiness.action,
                  section.label,
                )}
                className="col-start-2 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-md text-body-sm font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:col-start-3"
              >
                {readiness.action}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
