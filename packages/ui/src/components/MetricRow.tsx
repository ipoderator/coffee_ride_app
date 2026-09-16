import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

// docs/design.md §6: desktop shows 3-5 MetricTiles in a single row; mobile is 2
// columns, wrapping, never a horizontal scroller. §11's breakpoint table names three
// distinct steps for this exact component: `base` (single column — the narrowest
// phones), `sm` >= 640px ("two-column metric grid"), and `md` >= 768px (where wider
// layouts like the two-column ride detail appear). CR-044 fixed this component jumping
// straight from `base` to `md` without ever passing through its own named `sm` step.
// Below `sm`: single column, so a metric tile is never cramped on the narrowest
// screens design.md §1 targets (375px). `md`+: desktop single-row wrap, same cutover
// as before.
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
        'grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 md:flex md:flex-row md:flex-wrap md:gap-8',
        className,
      )}
    >
      {children}
    </div>
  );
}
