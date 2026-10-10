import { adminUserFilterValues } from 'types';
import {
  adminFiltersQuery,
  readAdminEnum,
  readAdminSearch,
} from '@/lib/admin/url-filters';
import type { AdminUsersFilters } from './api';

// CR-232: `/admin/users?q=&filter=` — parsed defensively, serialized without
// defaults.

export const USERS_FILTER_DEFAULTS: AdminUsersFilters = {
  q: '',
  filter: 'all',
};

export function parseUsersFilters(
  params: Pick<URLSearchParams, 'get'>,
): AdminUsersFilters {
  return {
    q: readAdminSearch(params),
    filter: readAdminEnum(params.get('filter'), adminUserFilterValues, 'all'),
  };
}

/** The list URL for `filters` — where a user's card leads back to. */
export function usersListHref(filters: AdminUsersFilters): string {
  return `/admin/users${adminFiltersQuery(filters, USERS_FILTER_DEFAULTS)}`;
}

/** A user's card, remembering the list's filters in `?from=` (only the query,
 * never a path — the card rebuilds the back link from it, so it cannot point
 * anywhere but the users list). */
export function userCardHref(userId: string, filters: AdminUsersFilters) {
  const query = adminFiltersQuery(filters, USERS_FILTER_DEFAULTS);
  return query
    ? `/admin/users/${userId}?from=${encodeURIComponent(query.slice(1))}`
    : `/admin/users/${userId}`;
}

/** The card's back link from its `?from=` value — re-parsed, so unknown or
 * hostile input degrades to the plain list. */
export function usersBackHref(from: string | undefined): string {
  return usersListHref(parseUsersFilters(new URLSearchParams(from ?? '')));
}
