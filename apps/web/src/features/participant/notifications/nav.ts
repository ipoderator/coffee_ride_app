import { CABINET_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

// ADR-009: this feature registers itself into the shared participant nav list
// (`@/lib/cabinet/participant-nav.ts`) instead of the shell branching on a
// hard-coded list of known features. Order 30, after `profileNavItem` (20) —
// leaves a gap for something else to slot in between later, same convention
// `CabinetNavItem.order`'s own doc comment names.
export const notificationsNavItem: CabinetNavItem = {
  label: CABINET_TERMS.notificationsNavLabel,
  href: '/me/notifications',
  order: 30,
  icon: 'Bell',
};
