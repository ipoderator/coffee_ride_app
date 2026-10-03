'use client';

import { ChevronDown } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import type { PublicRideListItem } from 'types';
import { Button, ErrorState, RIDE_DISCOVERY_TERMS, cn } from 'ui';
import type { PublicRidesList } from '../lib/use-public-rides';
import { ShowMoreRides } from './ShowMoreRides';

/**
 * CR-193 (owner QA): «Завершённые и отменённые» — `GET /v1/rides?phase=archive`
 * under the rides a visitor can still join, never mixed in with them. Collapsed
 * by default: a heading and «Показать N заездов»; open, the view's own cards or
 * rows (`children`) and their own «Показать ещё». Nothing at all while loading
 * or when the phase is empty, so a catalog without such rides looks exactly as
 * before. A failed load is a quiet inline notice with its own retry — unless
 * the main list failed too (`hideError`), whose error already says it.
 *
 * Stays mounted across chip changes (it renders `null` instead of unmounting),
 * so an opened section stays open while the visitor narrows the list.
 */
export function ArchivedRidesSection({
  archive,
  children,
  hideError = false,
  className,
  headClassName,
  headingClassName = 'text-h2',
  showMoreClassName,
}: {
  archive: PublicRidesList;
  /** The expanded list in the view's own presentation. */
  children: (rides: PublicRideListItem[]) => ReactNode;
  hideError?: boolean;
  className?: string;
  headClassName?: string;
  headingClassName?: string;
  showMoreClassName?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const panelId = useId();

  if (archive.status === 'loading') return null;
  if (archive.status === 'ready' && archive.total === 0) return null;
  if (archive.status === 'error' && hideError) return null;

  return (
    <section
      aria-labelledby={headingId}
      data-ride-archive
      className={cn('grid gap-4 md:gap-5', className)}
    >
      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-3',
          headClassName,
        )}
      >
        <h2 id={headingId} className={cn('text-text', headingClassName)}>
          {RIDE_DISCOVERY_TERMS.archiveTitle}
        </h2>
        {archive.status === 'ready' ? (
          <Button
            variant="secondary"
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded
              ? RIDE_DISCOVERY_TERMS.archiveHide
              : RIDE_DISCOVERY_TERMS.archiveShow(archive.total)}
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4', expanded && 'rotate-180')}
            />
          </Button>
        ) : null}
      </div>

      {archive.status === 'error' ? (
        <ErrorState
          message={RIDE_DISCOVERY_TERMS.archiveLoadError}
          variant="inline"
          tone="warning"
          onRetry={archive.retry}
          className={headClassName}
        />
      ) : (
        <div id={panelId} hidden={!expanded} className="grid gap-5 md:gap-7">
          {expanded ? (
            <>
              {children(archive.items)}
              <ShowMoreRides
                list={archive}
                className={showMoreClassName}
                buttonClassName="w-full md:w-auto"
              />
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}
