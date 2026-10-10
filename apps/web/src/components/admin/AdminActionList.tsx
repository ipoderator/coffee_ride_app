import Link from 'next/link';
import type { AdminActionItem } from 'types';
import { ADMIN_TERMS } from 'ui';
import { formatAdminDateTime } from '@/lib/admin/format';

/**
 * CR-231 (ADR-032): rows of the append-only action log — «Журнал» and a user
 * card's «История действий». `showTarget={false}` drops the target line where
 * every row is about the same record. A user target links to its card; rides
 * and reviews stay text (a hidden ride's public page 404s, a review has none).
 */
export function AdminActionList({
  items,
  showTarget = true,
}: {
  items: AdminActionItem[];
  showTarget?: boolean;
}) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li
          key={item.id}
          className="flex flex-col gap-1 border-b border-border py-3 first:pt-0 last:border-none last:pb-0"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-body-sm font-medium text-text">
              {ADMIN_TERMS.actionLabels[item.action]}
            </p>
            <p className="text-body-sm tabular-nums text-text-secondary">
              {formatAdminDateTime(item.createdAt)}
            </p>
          </div>
          {showTarget ? <ActionTarget item={item} /> : null}
          {item.reason ? (
            <p className="break-words text-body-sm text-text">
              {ADMIN_TERMS.reasonLine(item.reason)}
            </p>
          ) : null}
          <p className="break-words text-body-sm text-text-muted">
            {item.admin ? item.admin.email : ADMIN_TERMS.actorCli}
          </p>
        </li>
      ))}
    </ul>
  );
}

function ActionTarget({ item }: { item: AdminActionItem }) {
  if (item.targetLabel === null) {
    // CR-232: the id keeps two deleted targets apart (the log outlives them).
    return (
      <p className="wrap-anywhere text-body-sm tabular-nums text-text-muted">
        {ADMIN_TERMS.targetMissingWithId(item.targetId)}
      </p>
    );
  }
  if (item.targetType === 'user') {
    return (
      <p className="min-w-0 break-words text-body-sm">
        <Link
          href={`/admin/users/${item.targetId}`}
          className="rounded-sm text-text underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {item.targetLabel}
        </Link>
      </p>
    );
  }
  return (
    <p className="min-w-0 break-words text-body-sm text-text">
      {item.targetLabel}
    </p>
  );
}
