import { ADMIN_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

// CR-231 (ADR-009 registry, `@/lib/admin/admin-nav.ts`): the section's root.
export const adminOverviewNavItem: CabinetNavItem = {
  label: ADMIN_TERMS.nav.overview,
  href: '/admin',
  order: 0,
  icon: 'House',
};
