import { CABINET_TERMS } from 'ui';
import type { CabinetNavItem } from '@/lib/cabinet/types';

// ADR-009: this feature registers itself into the shared organizer nav list
// (`@/lib/cabinet/organizer-nav.ts`) instead of the shell branching on a
// hard-coded list of known features — same pattern as
// `features/participant/profile/nav.ts` (CR-013).
export const organizerProfileNavItem: CabinetNavItem = {
  label: CABINET_TERMS.organizerProfileNavLabel,
  href: '/organizer/profile',
  // CR-131: last, after the ride-work items — the mockup's sidebar leads with
  // Заезды/Участники/Обновления; the profile is edited rarely.
  order: 90,
  icon: 'CircleUser',
};
