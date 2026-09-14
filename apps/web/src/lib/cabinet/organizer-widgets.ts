import { organizerProfileWidget } from '@/features/organizer/profile/nav';
import type { DashboardWidget } from './types';

// ADR-009 registry (`.claude/rules/extensibility.md`), the widget counterpart
// to `organizer-nav.ts`. One entry today (the organizer profile summary,
// CR-015); a future organizer feature (rides, once CR-017+ exists) adds its
// own descriptor here, not a branch in `app/organizer/page.tsx`. Full
// flag-aware generalization of this pattern across both cabinets is CR-054,
// not this ticket.
export const ORGANIZER_WIDGETS: DashboardWidget[] = [
  organizerProfileWidget,
].sort((a, b) => a.order - b.order);
