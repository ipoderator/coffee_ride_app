import type { CabinetNavItem } from '@/lib/cabinet/types';

// ADR-009: this feature registers itself into the shared organizer nav list
// (`@/lib/cabinet/organizer-nav.ts`), same pattern as
// `features/organizer/profile/nav.ts`.
//
// Points at `/organizer/rides` (CR-088, `docs/design.md` §8 "My rides, grouped by
// status") — previously a stopgap straight at `/organizer/rides/new` before that list
// screen existed (see `.claude/context/known-issues.md` KI-024, now closed). The list
// page itself carries the "new ride" call to action, so one nav entry still covers
// the whole ride-management area.
export const organizerRidesNavItem: CabinetNavItem = {
  label: 'Заезды',
  href: '/organizer/rides',
  order: 20,
};
