import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

// CR-187 («Управление заездом»): a quiet callout that says *why* something on a
// screen behaves the way it does — «Маршрут закреплён после публикации» — in
// place of a disabled control or a yellow warning line. Not a status message
// (no live region: it describes the screen as it loads, it doesn't announce a
// change) and not an error (`ErrorState` keeps those). Text comes from the
// caller, same reason as `EmptyState`: only the screen knows what to explain.
export interface NoticeProps {
  /** One line naming the situation, e.g. «Маршрут закреплён после публикации». */
  title: string;
  /** What that means for the organizer and what they can still do. */
  children?: ReactNode;
  /** Decorative icon (a lock, people) — always `aria-hidden`. */
  icon?: ReactNode;
  className?: string;
}

export function Notice({ title, children, icon, className }: NoticeProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-xl bg-surface px-4 py-3 text-body-sm text-text-secondary',
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="mt-0.5 shrink-0 text-primary">
          {icon}
        </span>
      ) : null}
      <div className="flex min-w-0 flex-col gap-0.5">
        <p className="font-semibold text-text">{title}</p>
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
