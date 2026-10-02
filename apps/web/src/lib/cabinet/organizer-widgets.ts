import { organizerRegistrationActivityWidget } from '@/features/organizer/activity/nav';
import { organizerLiveRidesWidget } from '@/features/organizer/live-rides/nav';
import {
  organizerKpiWidget,
  organizerOverviewWidget,
} from '@/features/organizer/overview/nav';
import type { DashboardWidget } from './types';

// ADR-009 registry (`.claude/rules/extensibility.md`), the widget counterpart
// to `organizer-nav.ts`, laid out after the ADR-024 mockup (CR-131) and the
// CR-185 UX handoff (active work above the statistics): the greeting
// (`overview`), the rides needing a decision / under way / coming up
// (`live-rides`, CR-183/184), the four KPI cells (`overview`'s KPI row), then
// the registration feed + per-day chart (`activity`, CR-130). A future
// organizer feature adds its own descriptor here, not a branch in
// `app/organizer/page.tsx`. `/me` has its own registry since CR-185
// (`participant-widgets.ts`). Flag-gating a widget is CR-055's scope, not
// this file's.
export const ORGANIZER_WIDGETS: DashboardWidget[] = [
  organizerOverviewWidget,
  organizerLiveRidesWidget,
  organizerKpiWidget,
  organizerRegistrationActivityWidget,
].sort((a, b) => a.order - b.order);
