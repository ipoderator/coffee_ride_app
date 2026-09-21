import { organizerProfileWidget } from '@/features/organizer/profile/nav';
import { organizerRideSummaryWidget } from '@/features/organizer/rides/nav';
import type { DashboardWidget } from './types';

// ADR-009 registry (`.claude/rules/extensibility.md`), the widget counterpart
// to `organizer-nav.ts`. Two entries today (organizer profile summary,
// CR-015; ride/registration/waitlist summary, CR-103); a future organizer
// feature adds its own descriptor here, not a branch in
// `app/organizer/page.tsx`. `docs/design.md` §8 specs a widget grid only
// for `/organizer`, not `/me` (CR-054 confirmed this — no participant
// widget registry exists, and none is owed by the current design spec).
// Flag-gating a widget is CR-055's scope, not this file's.
export const ORGANIZER_WIDGETS: DashboardWidget[] = [
  organizerProfileWidget,
  organizerRideSummaryWidget,
].sort((a, b) => a.order - b.order);
