import { ORGANIZER_NEAREST_RIDE_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

// CR-131 (ADR-009 registry, `@/lib/cabinet/organizer-nav.ts`): «Участники» in
// the organizer sidebar/menu. `/organizer/participants` opens the nearest
// ride's participant list (`NearestRideRedirect`). CR-132: badged with the
// nearest ride's registrations in the last 24 hours.
export const organizerParticipantsNavItem: CabinetNavItem = {
  label: ORGANIZER_NEAREST_RIDE_TERMS.participantsNavLabel,
  href: '/organizer/participants',
  order: 30,
  icon: 'Users',
  badge: 'newRegistrations',
};
