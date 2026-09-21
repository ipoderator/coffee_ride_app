import { CABINET_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

// ADR-009: this feature registers itself into the shared participant nav
// list (`@/lib/cabinet/participant-nav.ts`) instead of the shell branching on
// a hard-coded list of known features.
export const profileNavItem: CabinetNavItem = {
  label: CABINET_TERMS.profileNavLabel,
  href: '/me/profile',
  order: 20,
  icon: 'CircleUser',
};
