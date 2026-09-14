import type { CabinetNavItem } from '@/lib/cabinet/types';

// ADR-009: this feature registers itself into the shared organizer nav list
// (`@/lib/cabinet/organizer-nav.ts`), same pattern as
// `features/organizer/profile/nav.ts`.
//
// Stopgap, same discipline as CR-013/014's stub screens: `docs/design.md` §8 lists
// `/organizer/rides` ("My rides, grouped by status") as the real destination for this
// nav entry, but no `docs/tasks.md` CR ticket builds that list yet (flagged in
// `.claude/context/known-issues.md`, not silently worked around) — points straight at
// the create screen until the list exists and gets its own "New ride" entry point.
export const organizerRidesNavItem: CabinetNavItem = {
  label: 'Заезды',
  href: '/organizer/rides/new',
  order: 20,
};
