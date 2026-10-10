import { ADMIN_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

export const adminUsersNavItem: CabinetNavItem = {
  label: ADMIN_TERMS.nav.users,
  href: '/admin/users',
  order: 10,
  icon: 'Users',
};
