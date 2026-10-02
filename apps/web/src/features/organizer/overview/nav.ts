import type { DashboardWidget } from '@/lib/cabinet/types';
import { OrganizerKpiWidget } from './components/OrganizerKpiWidget';
import { OrganizerOverviewWidget } from './components/OrganizerOverviewWidget';

// CR-131: first on `/organizer` (registry `@/lib/cabinet/organizer-widgets.ts`)
// — the greeting heads the page.
export const organizerOverviewWidget: DashboardWidget = {
  id: 'organizer-overview',
  order: 10,
  Component: OrganizerOverviewWidget,
};

// CR-185: the KPI row sits after the live rides (order 20) — active work
// first, statistics second (UX handoff).
export const organizerKpiWidget: DashboardWidget = {
  id: 'organizer-kpis',
  order: 25,
  Component: OrganizerKpiWidget,
};
