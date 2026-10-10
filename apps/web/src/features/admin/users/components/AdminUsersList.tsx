'use client';

import Link from 'next/link';
import { adminUserFilterValues, type AdminUserListItem } from 'types';
import { ADMIN_TERMS, Card } from 'ui';
import { AdminListBody } from '@/components/admin/AdminListBody';
import { AdminSearchForm } from '@/components/admin/AdminSearchForm';
import { AdminSelect } from '@/components/admin/AdminSelect';
import { formatAdminDateTime } from '@/lib/admin/format';
import { useAdminList } from '@/lib/admin/use-admin-list';
import { useAdminUrlFilters } from '@/lib/admin/use-admin-url-filters';
import { listAdminUsers, type AdminUsersFilters } from '../api';
import {
  USERS_FILTER_DEFAULTS,
  parseUsersFilters,
  userCardHref,
} from '../filters';
import { AdminUserBadges } from './AdminUserBadges';

const FILTER_OPTIONS = adminUserFilterValues.map((value) => ({
  value,
  label: ADMIN_TERMS.userFilters[value],
}));

/**
 * CR-231 (ADR-032): `/admin/users` — search by email or name, narrow by kind,
 * newest first; each row opens the user's card. CR-232: the search and the
 * filter live in the URL (`?q=&filter=`), and the card's back link returns to
 * them.
 */
export function AdminUsersList() {
  const [filters, setFilters] = useAdminUrlFilters(
    parseUsersFilters,
    USERS_FILTER_DEFAULTS,
  );
  const { state, loadMore, retry } = useAdminList<AdminUserListItem>(
    JSON.stringify(filters),
    (cursor) => listAdminUsers(filters, cursor),
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-h1 text-text">{ADMIN_TERMS.usersTitle}</h1>
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <AdminSearchForm
          label={ADMIN_TERMS.searchUsersLabel}
          initialValue={filters.q}
          onSearch={(q) => setFilters({ q })}
        />
        <AdminSelect
          label={ADMIN_TERMS.userFilterLegend}
          value={filters.filter}
          options={FILTER_OPTIONS}
          onChange={(filter) => setFilters({ filter })}
        />
      </div>
      <AdminListBody
        state={state}
        onRetry={retry}
        onLoadMore={loadMore}
        emptyTitle={ADMIN_TERMS.usersEmpty}
        emptyDescription={ADMIN_TERMS.emptyHint}
      >
        {(items) => (
          <Card className="p-4 md:p-5">
            <ul className="flex flex-col">
              {items.map((user) => (
                <UserRow key={user.id} user={user} filters={filters} />
              ))}
            </ul>
          </Card>
        )}
      </AdminListBody>
    </div>
  );
}

function UserRow({
  user,
  filters,
}: {
  user: AdminUserListItem;
  filters: AdminUsersFilters;
}) {
  return (
    <li className="flex flex-col gap-1 border-b border-border py-3 first:pt-0 last:border-none last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={userCardHref(user.id, filters)}
          className="min-w-0 break-all rounded-sm text-body font-medium text-text underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {user.email}
        </Link>
        <AdminUserBadges user={user} />
      </div>
      <p className="text-body-sm text-text-secondary">
        {user.displayName ?? ADMIN_TERMS.noDisplayName}
      </p>
      <p className="text-body-sm text-text-muted">
        {ADMIN_TERMS.columnRegistered}: {formatAdminDateTime(user.createdAt)}
        {' · '}
        {ADMIN_TERMS.columnEmail}:{' '}
        {user.emailVerified
          ? ADMIN_TERMS.emailVerified
          : ADMIN_TERMS.emailUnverified}
      </p>
    </li>
  );
}
