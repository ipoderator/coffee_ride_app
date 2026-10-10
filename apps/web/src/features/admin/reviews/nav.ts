import { ADMIN_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

export const adminReviewsNavItem: CabinetNavItem = {
  label: ADMIN_TERMS.nav.reviews,
  href: '/admin/reviews',
  order: 30,
  icon: 'MessageSquareText',
};
