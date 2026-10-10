import { ADMIN_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

export const adminActionsNavItem: CabinetNavItem = {
  label: ADMIN_TERMS.nav.actions,
  href: '/admin/actions',
  order: 40,
  icon: 'ScrollText',
};
