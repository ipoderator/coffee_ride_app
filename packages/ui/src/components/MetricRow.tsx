import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

// docs/design.md §6: desktop shows 3-5 MetricTiles in a single row; mobile is 2
// columns, wrapping, never a horizontal scroller. §11 introduces a two-column metric
// grid at the `sm` breakpoint (>= 640px) and a wider two-column ride-detail layout at
// `md` (>= 768px); this component treats `md` as the "desktop: single row" cutover —
// not spelled out as an exact pixel value by §6 itself, but the next breakpoint after
// §11's own "two-column" callout, and the point §11 says side navigation/wider layouts
// appear. Below `md`: a 2-column CSS grid, matching §6's mobile spec unconditionally
// (including the narrowest phones §11 calls `base`, not gated behind `sm`).
//
// Canonical order (дистанция -> набор высоты -> средний темп -> длительность, §6) is
// NOT enforced here — this component only lays out whatever `MetricTile`s it's given,
// in the order given. Consumers (starting CR-011/CR-026's ride screens) are
// responsible for passing them in that order.
export interface MetricRowProps {
  children: ReactNode;
  className?: string;
}

export function MetricRow({ children, className }: MetricRowProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-6 gap-y-4 md:flex md:flex-row md:flex-wrap md:gap-8',
        className,
      )}
    >
      {children}
    </div>
  );
}
