import type { AdminUserFilter } from 'types';
import type { AdminVisibility } from './visibility';

// CR-232: «Обзор» counters that open a list filtered to exactly those records.
// The query keys are the lists' own URL filters (`features/admin/*/filters.ts`);
// living in `lib`, these links let the overview point at them without importing
// another feature's internals (ADR-009). The values are typed against the same
// enums the lists parse, and the overview test checks each link round-trips.

const usersWith = (filter: AdminUserFilter) =>
  `/admin/users?${new URLSearchParams({ filter })}`;
const withVisibility = (path: string, visibility: AdminVisibility) =>
  `${path}?${new URLSearchParams({ visibility })}`;

export const ADMIN_LIST_LINKS = {
  unverifiedUsers: usersWith('unverified'),
  blockedUsers: usersWith('blocked'),
  hiddenRides: withVisibility('/admin/rides', 'hidden'),
  hiddenReviews: withVisibility('/admin/reviews', 'hidden'),
} as const;
