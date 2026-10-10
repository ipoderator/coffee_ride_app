import { adminActionsNavItem } from '@/features/admin/actions/nav';
import { adminOverviewNavItem } from '@/features/admin/overview/nav';
import { adminReviewsNavItem } from '@/features/admin/reviews/nav';
import { adminRidesNavItem } from '@/features/admin/rides/nav';
import { adminUsersNavItem } from '@/features/admin/users/nav';
import type { CabinetNavItem } from '@/lib/cabinet/types';

// CR-231 (ADR-009/ADR-032 registry): the `/admin` sidebar. «Обзор» is the
// root item — `isCabinetNavItemActive` lights a root only on its own path.
export const ADMIN_NAV_ITEMS: CabinetNavItem[] = [
  adminOverviewNavItem,
  adminUsersNavItem,
  adminRidesNavItem,
  adminReviewsNavItem,
  adminActionsNavItem,
].sort((a, b) => a.order - b.order);
