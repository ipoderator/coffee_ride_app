import { CABINET_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

// ADR-009: this feature registers itself into the shared participant nav
// list (`@/lib/cabinet/participant-nav.ts`) instead of the shell branching on
// a hard-coded list of known features. Sorted before `profileNavItem` (order
// 20) — leaves a gap (10, 20, ...) for something else to slot in between
// later, same convention `CabinetNavItem.order`'s own doc comment names.
export const myRegistrationsNavItem: CabinetNavItem = {
  label: CABINET_TERMS.myRegistrationsNavLabel,
  href: '/me/rides',
  order: 15,
  icon: 'Ticket',
};
