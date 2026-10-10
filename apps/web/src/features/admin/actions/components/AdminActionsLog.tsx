'use client';

import type { AdminActionItem } from 'types';
import { ADMIN_TERMS, Card } from 'ui';
import { AdminActionList } from '@/components/admin/AdminActionList';
import { AdminListBody } from '@/components/admin/AdminListBody';
import { AdminSelect } from '@/components/admin/AdminSelect';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { useAdminUrlFilters } from '@/lib/admin/use-admin-url-filters';
import { listAdminActions } from '../api';
import {
  ACTIONS_FILTER_DEFAULTS,
  actionsFor,
  parseActionsFilters,
  withMatchingAction,
  type AdminActionsFilters,
} from '../filters';

const TARGET_OPTIONS = (
  Object.keys(ADMIN_TERMS.targetTypeFilters) as Array<
    AdminActionsFilters['targetType']
  >
).map((value) => ({ value, label: ADMIN_TERMS.targetTypeFilters[value] }));

/**
 * CR-231 (ADR-032): `/admin/actions` — the append-only log, newest first.
 * Read-only: there is nothing here (or in the API) that edits or deletes a row.
 * CR-232: filtered by target type and action, both in the URL
 * (`?targetType=&action=`); the action choices narrow to the chosen type.
 */
export function AdminActionsLog() {
  const [filters, setFilters] = useAdminUrlFilters(
    parseActionsFilters,
    ACTIONS_FILTER_DEFAULTS,
  );
  const { state, loadMore, retry } = useAdminList<AdminActionItem>(
    JSON.stringify(filters),
    (cursor) => listAdminActions(filters, cursor),
  );
  const actionOptions = [
    { value: 'any' as const, label: ADMIN_TERMS.anyAction },
    ...actionsFor(filters.targetType).map((value) => ({
      value,
      label: ADMIN_TERMS.actionLabels[value],
    })),
  ];
  const isFiltered = filters.targetType !== 'any' || filters.action !== 'any';

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-text">{ADMIN_TERMS.actionsTitle}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:max-w-2xl">
        <AdminSelect
          label={ADMIN_TERMS.actionsFilterTarget}
          value={filters.targetType}
          options={TARGET_OPTIONS}
          onChange={(targetType) =>
            setFilters(withMatchingAction({ ...filters, targetType }))
          }
        />
        <AdminSelect
          label={ADMIN_TERMS.actionsFilterAction}
          value={filters.action}
          options={actionOptions}
          onChange={(action) => setFilters({ action })}
        />
      </div>
      <AdminListBody
        state={state}
        onRetry={retry}
        onLoadMore={loadMore}
        emptyTitle={
          isFiltered
            ? ADMIN_TERMS.actionsEmptyFiltered
            : ADMIN_TERMS.actionsEmpty
        }
        emptyDescription={isFiltered ? ADMIN_TERMS.emptyHint : undefined}
      >
        {(items) => (
          <Card className="p-4 md:p-5">
            <AdminActionList items={items} />
          </Card>
        )}
      </AdminListBody>
    </div>
  );
}
