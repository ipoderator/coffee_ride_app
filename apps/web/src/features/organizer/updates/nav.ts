import { ORGANIZER_NEAREST_RIDE_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

// CR-131 (ADR-009 registry, `@/lib/cabinet/organizer-nav.ts`): «Обновления» in
// the organizer sidebar/menu. `/organizer/updates` opens the nearest ride's
// updates composer (`NearestRideRedirect`).
export const organizerUpdatesNavItem: CabinetNavItem = {
  label: ORGANIZER_NEAREST_RIDE_TERMS.updatesNavLabel,
  href: '/organizer/updates',
  order: 40,
  icon: 'Send',
};
