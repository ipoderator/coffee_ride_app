import { organizerRegistrationActivityWidget } from '@/features/organizer/activity/nav';
import { organizerOverviewWidget } from '@/features/organizer/overview/nav';
import type { DashboardWidget } from './types';

// ADR-009 registry (`.claude/rules/extensibility.md`), the widget counterpart
// to `organizer-nav.ts`. Two entries today, laid out after the ADR-024
// mockup (CR-131): the greeting + four KPI cells (`overview`), then the
// registration feed + per-day chart (`activity`, CR-130). CR-015's profile
// card and CR-103's ride-count cells were retired from this page by CR-131
// (the profile is a sidebar item). A future organizer
// feature adds its own descriptor here, not a branch in
// `app/organizer/page.tsx`. `docs/design.md` §8 specs a widget grid only
// for `/organizer`, not `/me` (CR-054 confirmed this — no participant
// widget registry exists, and none is owed by the current design spec).
// Flag-gating a widget is CR-055's scope, not this file's.
export const ORGANIZER_WIDGETS: DashboardWidget[] = [
  organizerOverviewWidget,
  organizerRegistrationActivityWidget,
].sort((a, b) => a.order - b.order);
