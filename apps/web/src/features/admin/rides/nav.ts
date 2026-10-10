import { ADMIN_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

export const adminRidesNavItem: CabinetNavItem = {
  label: ADMIN_TERMS.nav.rides,
  href: '/admin/rides',
  order: 20,
  icon: 'Route',
};
