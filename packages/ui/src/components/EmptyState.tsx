import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

// docs/design.md §10, point 2: an empty state must explain *why* it's empty and offer
// the next action — "Пока нет заездов по этим фильтрам" + "Сбросить фильтры", never a
// bare "Нет данных". Neither `title` nor `action` has a default here on purpose: only
// the calling screen knows *why* it's empty and what the useful next action is
// (`.claude/rules/frontend.md` also forbids hard-coding user-visible Russian strings
// inside a shared component — this text is inherently per-screen, so it can't live in
// `terminology.ts` either).
//
// `role="status"`: an empty state most often *replaces* a loading/results region after
// a filter or search completes, which is exactly the case a screen-reader user needs
// announced without moving focus — `status` is the polite (non-interrupting) live
// region role, matching `docs/design.md` §12's WCAG AA target.
export interface EmptyStateProps {
  /** Explains why there's nothing here, e.g. "Пока нет заездов по этим фильтрам". */
  title: string;
  /** Optional supporting detail, rendered below the title. */
  description?: string;
  /** The next action, e.g. a "Сбросить фильтры" button. */
  action?: ReactNode;
  /** Optional decorative illustration/icon — always `aria-hidden`, never load-bearing. */
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center gap-3 py-12 text-center',
        className,
      )}
    >
      {icon ? (
        <div aria-hidden="true" className="text-text-muted">
          {icon}
        </div>
      ) : null}
      <p className="text-sm font-medium text-text">{title}</p>
      {description ? (
        <p className="max-w-sm text-sm text-text-secondary">{description}</p>
      ) : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
