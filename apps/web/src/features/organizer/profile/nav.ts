import { CABINET_TERMS } from 'ui';
import type { CabinetNavItem, DashboardWidget } from '@/lib/cabinet/types';
import { OrganizerProfileWidget } from './components/OrganizerProfileWidget';

// ADR-009: this feature registers itself into the shared organizer nav list
// (`@/lib/cabinet/organizer-nav.ts`) instead of the shell branching on a
// hard-coded list of known features — same pattern as
// `features/participant/profile/nav.ts` (CR-013).
export const organizerProfileNavItem: CabinetNavItem = {
  label: CABINET_TERMS.organizerProfileNavLabel,
  href: '/organizer/profile',
  order: 10,
};

// CR-015: same registration into `@/lib/cabinet/organizer-widgets.ts`, for the
// `/organizer` dashboard's widget grid instead of its nav.
export const organizerProfileWidget: DashboardWidget = {
  id: 'organizer-profile-summary',
  order: 10,
  Component: OrganizerProfileWidget,
};
