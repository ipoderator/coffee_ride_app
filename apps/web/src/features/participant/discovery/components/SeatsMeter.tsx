import { cn } from 'ui';
import type { RideCardSeats } from '../lib/ride-metrics';

const SEATS_BAR_CLASSNAME = {
  low: 'bg-warning-fill',
  full: 'bg-text-muted',
  open: 'bg-primary-fill',
} as const;

/**
 * CR-153: «13 из 20 участников · Осталось 7 мест» over a fill bar — the grid
 * card's and the featured card's seats line (was inline in CR-144's card).
 * The bar is decorative (`aria-hidden`); the text carries the numbers.
 */
export function SeatsMeter({
  seats,
  className,
}: {
  seats: RideCardSeats;
  className?: string;
}) {
  return (
    <div className={cn('grid gap-2', className)}>
      {/* Each half stays on one line; if both don't fit, the note moves to
          its own line whole rather than breaking mid-phrase. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-body-sm font-medium whitespace-nowrap tabular-nums">
          {seats.count}
        </span>
        <span
          className={cn(
            'text-body-sm whitespace-nowrap tabular-nums',
            seats.level === 'low' ? 'text-warning' : 'text-text-muted',
          )}
        >
          {seats.note}
        </span>
      </div>
      {seats.fillPercent !== null ? (
        <div
          aria-hidden="true"
          className="h-1.5 overflow-hidden rounded-full bg-surface"
        >
          <div
            className={cn(
              'h-full rounded-full',
              SEATS_BAR_CLASSNAME[seats.level],
            )}
            style={{ width: `${seats.fillPercent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
